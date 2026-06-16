#include <iostream>
#include <string>

extern std::string getPlatformName();
extern std::string currentWorkingDirectory();
extern std::string getMachineName();
extern std::string getMachineInfo();

int runContext() {
    std::cout << "NexCode CLI context:\n";
    std::cout << "  Platform: " << getPlatformName() << "\n";
    std::cout << "  Hostname: " << getMachineName() << "\n";
    std::cout << "  Architecture: " << getMachineInfo() << "\n";
    std::cout << "  Working directory: " << currentWorkingDirectory() << "\n";
    return 0;
}
