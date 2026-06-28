CXX = g++
CXXFLAGS = -std=c++17 -Wall -Wextra -O2 -Wno-unused-parameter

TARGET = build/nexcode.exe

SOURCES = \
	src/commands.cpp \
	src/desktop.cpp \
	src/main.cpp \
	src/commands/context.cpp \
	src/commands/output.cpp \
	src/commands/version.cpp \
	src/util/command.cpp \
	src/util/errors.cpp \
	src/util/input.cpp \
	src/util/machine.cpp \
	src/util/os.cpp \
	src/util/tar.cpp

OBJECTS = \
	build/commands.o \
	build/desktop.o \
	build/main.o \
	build/context.o \
	build/output.o \
	build/version.o \
	build/command.o \
	build/errors.o \
	build/input.o \
	build/machine.o \
	build/os.o \
	build/tar.o

.PHONY: all clean

all: $(TARGET)

$(TARGET): $(OBJECTS)
	@if not exist "build" mkdir "build"
	$(CXX) $(CXXFLAGS) -o $@ $^

build/main.o: src/main.cpp
	@if not exist "build" mkdir "build"
	$(CXX) $(CXXFLAGS) -c -o $@ $<

build/commands.o: src/commands.cpp
	@if not exist "build" mkdir "build"
	$(CXX) $(CXXFLAGS) -c -o $@ $<

build/desktop.o: src/desktop.cpp
	@if not exist "build" mkdir "build"
	$(CXX) $(CXXFLAGS) -c -o $@ $<

build/context.o: src/commands/context.cpp
	@if not exist "build" mkdir "build"
	$(CXX) $(CXXFLAGS) -c -o $@ $<

build/output.o: src/commands/output.cpp
	@if not exist "build" mkdir "build"
	$(CXX) $(CXXFLAGS) -c -o $@ $<

build/version.o: src/commands/version.cpp
	@if not exist "build" mkdir "build"
	$(CXX) $(CXXFLAGS) -c -o $@ $<

build/command.o: src/util/command.cpp
	@if not exist "build" mkdir "build"
	$(CXX) $(CXXFLAGS) -c -o $@ $<

build/errors.o: src/util/errors.cpp
	@if not exist "build" mkdir "build"
	$(CXX) $(CXXFLAGS) -c -o $@ $<

build/input.o: src/util/input.cpp
	@if not exist "build" mkdir "build"
	$(CXX) $(CXXFLAGS) -c -o $@ $<

build/machine.o: src/util/machine.cpp
	@if not exist "build" mkdir "build"
	$(CXX) $(CXXFLAGS) -c -o $@ $<

build/os.o: src/util/os.cpp
	@if not exist "build" mkdir "build"
	$(CXX) $(CXXFLAGS) -c -o $@ $<

build/tar.o: src/util/tar.cpp
	@if not exist "build" mkdir "build"
	$(CXX) $(CXXFLAGS) -c -o $@ $<

clean:
	@if exist "build" rmdir /s /q "build"