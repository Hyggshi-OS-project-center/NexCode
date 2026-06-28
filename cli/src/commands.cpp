#include <iostream>
#include <string>
#include <vector>

int runVersion();
int runContext();
int runOutput(const std::vector<std::string>& args);
int runDesktop(const std::vector<std::string>& args);

void printHelp(const std::string& error = {}) {
    if (!error.empty()) {
        std::cerr << "Error: " << error << "\n\n";
    }

    std::cout << "Usage: nexcode [command] [options]\n"
              << "Commands:\n"
              << "  help                 Show this help message\n"
              << "  version              Print CLI version\n"
              << "  context              Show system and workspace context\n"
              << "  output [args...]     Render sample output or echo text\n"
              << "  desktop [path]       Open a folder or file in the system file explorer\n"
              << "\n"
              << "Examples:\n"
              << "  nexcode version\n"
              << "  nexcode context\n"
              << "  nexcode output Hello from NexCode CLI\n"
              << "  nexcode desktop .\n";
}

int handleCommand(int argc, char** argv) {
    if (argc < 2) {
        printHelp();
        return 0;
    }

    std::string command = argv[1];
    std::vector<std::string> args;
    for (int i = 2; i < argc; ++i) {
        args.emplace_back(argv[i]);
    }

    if (command == "help" || command == "--help" || command == "-h") {
        printHelp();
        return 0;
    }

    if (command == "version" || command == "--version") {
        return runVersion();
    }

    if (command == "context") {
        return runContext();
    }

    if (command == "output") {
        return runOutput(args);
    }

    if (command == "desktop") {
        return runDesktop(args);
    }

    printHelp("Unknown command: " + command);
    return 1;
}
