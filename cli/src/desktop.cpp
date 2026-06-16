#include <iostream>
#include <string>
#include <vector>

extern std::string currentWorkingDirectory();
extern bool pathExists(const std::string& path);
extern bool openPathInExplorer(const std::string& path);

int runDesktop(const std::vector<std::string>& args) {
    std::string target;
    if (args.empty()) {
        target = currentWorkingDirectory();
    } else {
        target = args[0];
    }

    if (target.empty()) {
        std::cerr << "desktop: could not determine a path to open.\n";
        return 1;
    }

    if (!pathExists(target)) {
        std::cerr << "desktop: path does not exist: " << target << "\n";
        return 1;
    }

    std::cout << "Opening file explorer at: " << target << "\n";
    if (!openPathInExplorer(target)) {
        std::cerr << "desktop: failed to open path in file explorer.\n";
        return 1;
    }

    return 0;
}
