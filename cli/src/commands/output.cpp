#include <iostream>
#include <sstream>
#include <string>
#include <vector>

extern bool pathExists(const std::string& path);
extern std::string readFileContents(const std::string& path);

static std::string joinArguments(const std::vector<std::string>& args) {
    std::ostringstream builder;
    for (std::size_t i = 0; i < args.size(); ++i) {
        if (i > 0) {
            builder << ' ';
        }
        builder << args[i];
    }
    return builder.str();
}

int runOutput(const std::vector<std::string>& args) {
    if (args.empty()) {
        std::cout << "NexCode CLI output sample:\n"
                  << "  - Use `nexcode output <text>` to echo text.\n"
                  << "  - Use `nexcode output cat <path>` to print a file to stdout.\n";
        return 0;
    }

    if (args.size() >= 2 && args[0] == "cat") {
        std::string path = args[1];
        if (!pathExists(path)) {
            std::cerr << "output: file not found: " << path << "\n";
            return 1;
        }

        std::cout << readFileContents(path);
        return 0;
    }

    std::cout << joinArguments(args) << "\n";
    return 0;
}
