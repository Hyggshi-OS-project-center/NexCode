#include <string>

#ifdef _WIN32
#include <windows.h>
#else
#include <sys/utsname.h>
#include <unistd.h>
#endif

std::string getMachineName() {
#ifdef _WIN32
    char buffer[MAX_COMPUTERNAME_LENGTH + 1] = {0};
    DWORD size = sizeof(buffer);
    if (GetComputerNameA(buffer, &size)) {
        return std::string(buffer, size);
    }
    return "unknown";
#else
    char buffer[256] = {0};
    if (gethostname(buffer, sizeof(buffer)) == 0) {
        return std::string(buffer);
    }
    return "unknown";
#endif
}

std::string getMachineInfo() {
#ifdef _WIN32
    SYSTEM_INFO info;
    GetNativeSystemInfo(&info);
    switch (info.wProcessorArchitecture) {
        case PROCESSOR_ARCHITECTURE_AMD64:
            return "x64";
        case PROCESSOR_ARCHITECTURE_INTEL:
            return "x86";
        case PROCESSOR_ARCHITECTURE_ARM64:
            return "ARM64";
        default:
            return "unknown";
    }
#else
    struct utsname unameData;
    if (uname(&unameData) == 0) {
        return std::string(unameData.machine);
    }
    return "unknown";
#endif
}
