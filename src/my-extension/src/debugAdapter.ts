import {
    LoggingDebugSession,
    InitializedEvent,
    TerminatedEvent,
    StoppedEvent,
    OutputEvent,
    Thread,
    StackFrame,
    Scope,
    Source,
    Breakpoint,
    Handles
} from '@vscode/debugadapter';
import { DebugProtocol } from '@vscode/debugprotocol';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';

interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
    program: string;
    stopOnEntry?: boolean;
    /** Path to the `hosc` CLI executable. Defaults to build/cmake/bin/hosc[.exe] under the workspace. */
    hoscExecutable?: string;
    cwd?: string;
    trace?: boolean;
}

// Mã màu ANSI cho Debug Console (VS Code render được escape code chuẩn)
const Color = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m',
    bold: '\x1b[1m'
};

function colorize(text: string, color: string): string {
    return `${color}${text}${Color.reset}`;
}

export class HOSCDebugSession extends LoggingDebugSession {
    private static THREAD_ID = 1;

    private breakpointsByFile: Map<string, DebugProtocol.Breakpoint[]> = new Map();
    private isRunning = false;
    private programPath: string = '';
    private stopOnEntry: boolean = false;
    private variableHandles = new Handles<string>();
    private hoscExecutable: string = '';
    private workingDir: string = '';
    private childProcess?: ChildProcessWithoutNullStreams;

    public constructor() {
        super();
        this.setDebuggerLinesStartAt1(true);
        this.setDebuggerColumnsStartAt1(false);
    }

    protected initializeRequest(
        response: DebugProtocol.InitializeResponse,
        args: DebugProtocol.InitializeRequestArguments
    ): void {
        response.body = response.body || {};
        response.body.supportsConfigurationDoneRequest = true;
        response.body.supportsEvaluateForHovers = false;
        response.body.supportsStepBack = false;
        response.body.supportsGotoTargetsRequest = false;
        response.body.supportsHitConditionalBreakpoints = false;
        response.body.supportsConditionalBreakpoints = false;
        response.body.supportsLogPoints = false;
        response.body.supportsModulesRequest = false;

        this.sendResponse(response);
        this.sendEvent(new InitializedEvent());
    }

    protected launchRequest(
        response: DebugProtocol.LaunchResponse,
        args: LaunchRequestArguments
    ): void {
        this.programPath = args.program;
        this.stopOnEntry = args.stopOnEntry || false;
        this.workingDir = args.cwd || path.dirname(this.programPath);

        // build/cmake/bin/hosc[.exe] — theo build.md, CMake ghi executable ra đây
        const defaultExeName = process.platform === 'win32' ? 'hosc.exe' : 'hosc';
        this.hoscExecutable = args.hoscExecutable
            || path.join(this.workingDir, 'build', 'cmake', 'bin', defaultExeName);

        if (!this.programPath) {
            response.success = false;
            response.message = colorize('Program path is required', Color.red);
            this.sendResponse(response);
            return;
        }

        if (!fs.existsSync(this.programPath)) {
            response.success = false;
            response.message = colorize(`Program not found: ${this.programPath}`, Color.red);
            this.sendResponse(response);
            return;
        }

        if (!fs.existsSync(this.hoscExecutable)) {
            response.success = false;
            response.message = colorize(
                `hosc executable not found: ${this.hoscExecutable} — build it first (cmake --build build/cmake) or set "hoscExecutable" in launch.json`,
                Color.red
            );
            this.sendResponse(response);
            return;
        }

        this.sendEvent(new OutputEvent(
            colorize(`▶ ${this.hoscExecutable} run ${this.programPath}\n`, Color.cyan),
            'console'
        ));

        this.sendResponse(response);
        this.runProgram();
    }

    protected disconnectRequest(
        response: DebugProtocol.DisconnectResponse,
        args: DebugProtocol.DisconnectArguments
    ): void {
        this.terminateDebugSession();
        this.sendResponse(response);
    }

    protected setBreakPointsRequest(
        response: DebugProtocol.SetBreakpointsResponse,
        args: DebugProtocol.SetBreakpointsArguments
    ): void {
        const filePath = args.source.path as string;
        const clientLines = args.lines || [];

        const actualBreakpoints: DebugProtocol.Breakpoint[] = clientLines.map((line: number) => {
            const bp = new Breakpoint(true, line) as DebugProtocol.Breakpoint;
            return bp;
        });

        this.breakpointsByFile.set(filePath, actualBreakpoints);

        const verifiedCount = actualBreakpoints.filter(bp => bp.verified).length;
        this.sendEvent(new OutputEvent(
            colorize(`● ${verifiedCount}/${actualBreakpoints.length} breakpoint(s) set in ${path.basename(filePath)}\n`, Color.yellow),
            'console'
        ));

        response.body = {
            breakpoints: actualBreakpoints
        };
        this.sendResponse(response);
    }

    protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
        response.body = {
            threads: [
                new Thread(HOSCDebugSession.THREAD_ID, "HOSC Thread")
            ]
        };
        this.sendResponse(response);
    }

    protected stackTraceRequest(
        response: DebugProtocol.StackTraceResponse,
        args: DebugProtocol.StackTraceArguments
    ): void {
        const startFrame = typeof args.startFrame === 'number' ? args.startFrame : 0;
        const maxLevels = typeof args.levels === 'number' ? args.levels : 100;

        const stackFrames: StackFrame[] = [
            new StackFrame(0, 'main', new Source(path.basename(this.programPath), this.programPath), 1, 1)
        ];

        response.body = {
            stackFrames: stackFrames.slice(startFrame, startFrame + maxLevels),
            totalFrames: stackFrames.length
        };
        this.sendResponse(response);
    }

    protected scopesRequest(
        response: DebugProtocol.ScopesResponse,
        args: DebugProtocol.ScopesArguments
    ): void {
        const scopes: Scope[] = [
            new Scope("Locals", this.variableHandles.create("locals"), false),
            new Scope("Globals", this.variableHandles.create("globals"), true)
        ];

        response.body = {
            scopes: scopes
        };
        this.sendResponse(response);
    }

    protected variablesRequest(
        response: DebugProtocol.VariablesResponse,
        args: DebugProtocol.VariablesArguments
    ): void {
        const variables: DebugProtocol.Variable[] = [];

        response.body = {
            variables: variables
        };
        this.sendResponse(response);
    }

    protected continueRequest(
        response: DebugProtocol.ContinueResponse,
        args: DebugProtocol.ContinueArguments
    ): void {
        response.body = {
            allThreadsContinued: false
        };
        this.sendResponse(response);
    }

    protected nextRequest(
        response: DebugProtocol.NextResponse,
        args: DebugProtocol.NextArguments
    ): void {
        this.sendResponse(response);
    }

    protected stepInRequest(
        response: DebugProtocol.StepInResponse,
        args: DebugProtocol.StepInArguments
    ): void {
        this.sendResponse(response);
    }

    protected stepOutRequest(
        response: DebugProtocol.StepOutResponse,
        args: DebugProtocol.StepOutArguments
    ): void {
        this.sendResponse(response);
    }

    protected pauseRequest(
        response: DebugProtocol.PauseResponse,
        args: DebugProtocol.PauseArguments
    ): void {
        this.sendResponse(response);
    }

    protected evaluateRequest(
        response: DebugProtocol.EvaluateResponse,
        args: DebugProtocol.EvaluateArguments
    ): void {
        response.body = {
            result: 'undefined',
            variablesReference: 0
        };
        this.sendResponse(response);
    }

    private runProgram(): void {
        this.isRunning = true;

        if (this.stopOnEntry) {
            this.sendEvent(new OutputEvent(
                colorize('⏸ Stopped on entry\n', Color.yellow),
                'console'
            ));
            this.sendEvent(new StoppedEvent('entry', HOSCDebugSession.THREAD_ID));
            // Chờ configurationDone/continue trước khi thật sự spawn — với adapter tối giản này,
            // ta spawn ngay để giữ hành vi đơn giản; nếu cần dừng thật ở entry, gate việc spawn
            // trong continueRequest thay vì ở đây.
        }

        this.childProcess = spawn(this.hoscExecutable, ['run', this.programPath], {
            cwd: this.workingDir
        });

        this.childProcess.stdout.on('data', (data: Buffer) => {
            this.sendEvent(new OutputEvent(data.toString(), 'stdout'));
        });

        this.childProcess.stderr.on('data', (data: Buffer) => {
            this.sendEvent(new OutputEvent(colorize(data.toString(), Color.red), 'stderr'));
        });

        this.childProcess.on('error', (err) => {
            this.sendEvent(new OutputEvent(
                colorize(`✖ Failed to start hosc: ${err.message}\n`, Color.red),
                'console'
            ));
            this.sendEvent(new TerminatedEvent());
            this.isRunning = false;
        });

        this.childProcess.on('close', (code) => {
            const msg = code === 0
                ? colorize(`✔ Program exited with code 0\n`, Color.green)
                : colorize(`✖ Program exited with code ${code}\n`, Color.red);
            this.sendEvent(new OutputEvent(msg, 'console'));
            this.sendEvent(new TerminatedEvent());
            this.isRunning = false;
        });
    }

    private terminateDebugSession(): void {
        this.isRunning = false;
        if (this.childProcess && !this.childProcess.killed) {
            this.childProcess.kill();
        }
    }
}

// Entry point: VS Code chạy file này như 1 process riêng (stdin/stdout làm kênh giao tiếp DAP).
// Không có dòng này thì adapter compile được nhưng không bao giờ chạy.
HOSCDebugSession.run(HOSCDebugSession);
