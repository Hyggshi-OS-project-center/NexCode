#include <iostream>
#include <string>
#include <vector>

std::vector<std::string> splitArgs(int argc, char** argv) {
    std::vector<std::string> result;
    result.reserve(argc);
    for (int i = 0; i < argc; ++i) {
        result.emplace_back(argv[i]);
    }
    return result;
}

bool yesNoPrompt(const std::string& prompt) {
    std::cout << prompt << " [y/N]: ";
    std::string answer;
    if (!std::getline(std::cin, answer)) {
        return false;
    }

    if (answer.empty()) {
        return false;
    }

    char first = answer[0];
    return first == 'y' || first == 'Y';
}
