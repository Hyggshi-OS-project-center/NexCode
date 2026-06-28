#include <iostream>
#include <string>

int fatalError(const std::string& message, int code) {
    std::cerr << "Error: " << message << "\n";
    return code;
}

void printWarning(const std::string& message) {
    std::cerr << "Warning: " << message << "\n";
}
