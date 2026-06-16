#include <array>
#include <fstream>
#include <string>
#include <vector>

static std::size_t parseOctal(const char* field, std::size_t size) {
    std::size_t result = 0;
    for (std::size_t i = 0; i < size && field[i] != '\0'; ++i) {
        if (field[i] >= '0' && field[i] <= '7') {
            result = (result << 3) + static_cast<std::size_t>(field[i] - '0');
        }
    }
    return result;
}

bool isTarArchive(const std::string& path) {
    std::ifstream input(path, std::ios::binary);
    if (!input) {
        return false;
    }

    std::array<char, 512> buffer{};
    input.read(buffer.data(), buffer.size());
    if (static_cast<std::size_t>(input.gcount()) != buffer.size()) {
        return false;
    }

    return std::string(buffer.data() + 257, buffer.data() + 262) == "ustar";
}

std::vector<std::string> listTarContents(const std::string& path) {
    std::vector<std::string> result;
    std::ifstream input(path, std::ios::binary);
    if (!input) {
        return result;
    }

    while (true) {
        std::array<char, 512> header{};
        input.read(header.data(), header.size());
        if (static_cast<std::size_t>(input.gcount()) != header.size()) {
            break;
        }

        bool emptyBlock = true;
        for (char byte : header) {
            if (byte != '\0') {
                emptyBlock = false;
                break;
            }
        }

        if (emptyBlock) {
            break;
        }

        std::string name(header.data(), header.data() + 100);
        if (auto end = name.find('\0'); end != std::string::npos) {
            name.resize(end);
        }

        if (!name.empty()) {
            result.push_back(name);
        }

        std::size_t fileSize = parseOctal(header.data() + 124, 12);
        std::size_t blocks = (fileSize + 511) / 512;
        input.seekg(static_cast<std::streamoff>(blocks * 512), std::ios::cur);
        if (!input) {
            break;
        }
    }

    return result;
}
