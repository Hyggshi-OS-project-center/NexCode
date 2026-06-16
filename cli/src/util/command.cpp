#include <array>
#include <cstdio>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

#ifdef _WIN32
#define popen _popen
#define pclose _pclose
#endif

std::string executeCommand(const std::string& command, int& exitCode) {
    std::array<char, 256> buffer;
    std::string output;

    FILE* pipe = popen(command.c_str(), "r");
    if (!pipe) {
        exitCode = -1;
        return "";
    }

    while (fgets(buffer.data(), static_cast<int>(buffer.size()), pipe) != nullptr) {
        output += buffer.data();
    }

    int result = pclose(pipe);
    exitCode = result;
    return output;
}
