#include <filesystem>
#include <fstream>
#include <iostream>
#include <iterator>
#include <string>

#ifdef _WIN32
#include <windows.h>
#endif

bool pathExists(const std::string& path) {
    try {
        return std::filesystem::exists(std::filesystem::u8path(path));
    } catch (...) {
        return false;
    }
}

std::string currentWorkingDirectory() {
    try {
        return std::filesystem::current_path().u8string();
    } catch (...) {
        return std::string();
    }
}

std::string normalizePath(const std::string& path) {
    try {
        auto candidate = std::filesystem::u8path(path);
        if (candidate.is_absolute()) {
            return candidate.u8string();
        }
        return std::filesystem::absolute(candidate).u8string();
    } catch (...) {
        return path;
    }
}

std::string getPlatformName() {
#ifdef _WIN32
    return "Windows";
#elif defined(__APPLE__)
    return "macOS";
#else
    return "Linux";
#endif
}

bool openPathInExplorer(const std::string& target) {
    std::string path = normalizePath(target);
    if (!pathExists(path)) {
        return false;
    }

#ifdef _WIN32
    std::string command = "explorer \"" + path + "\"";
#elif defined(__APPLE__)
    std::string command = "open \"" + path + "\"";
#else
    std::string command = "xdg-open \"" + path + "\"";
#endif
    return std::system(command.c_str()) == 0;
}

std::string readFileContents(const std::string& path) {
    std::ifstream input(path, std::ios::binary);
    if (!input) {
        return std::string();
    }

    std::string contents;
    contents.assign(std::istreambuf_iterator<char>(input), std::istreambuf_iterator<char>());
    return contents;
}
