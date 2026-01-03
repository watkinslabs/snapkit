# SnapKit GNOME Extension Makefile

EXTENSION_UUID = snapkit@watkinslabs
EXTENSION_DIR = $(EXTENSION_UUID)
INSTALL_DIR = $(HOME)/.local/share/gnome-shell/extensions/$(EXTENSION_UUID)
BUILD_DIR = build
ZIP_NAME = $(EXTENSION_UUID).shell-extension.zip

# Extension files to install/package
FILES = extension.js prefs.js metadata.json stylesheet.css
DIRS = lib layouts schemas

# Colors for output
C_RED    := \033[0;31m
C_GREEN  := \033[0;32m
C_YELLOW := \033[0;33m
C_BLUE   := \033[0;34m
C_NC     := \033[0m

# Status prefixes (for use with printf)
P_INFO   := $(C_BLUE)[*]$(C_NC)
P_OK     := $(C_GREEN)[✓]$(C_NC)
P_WARN   := $(C_YELLOW)[!]$(C_NC)
P_ERR    := $(C_RED)[✗]$(C_NC)

.PHONY: help install uninstall enable disable reload dev restart clean deploy build compile-schemas check-deps status

help:
	@echo "SnapKit Extension - Available targets:"
	@echo "  make install          - Install extension to user directory"
	@echo "  make uninstall        - Remove extension from user directory"
	@echo "  make enable           - Enable the extension"
	@echo "  make disable          - Disable the extension"
	@echo "  make reload           - Reinstall and reload extension (may need logout on Wayland)"
	@echo "  make dev              - Test in nested GNOME Shell at 2560x1440 (or DEV_RESOLUTION=WxH)"
	@echo "  make restart          - Restart GNOME Shell (X11 only)"
	@echo "  make deploy           - Create distributable zip file"
	@echo "  make clean            - Remove build artifacts"
	@echo "  make compile-schemas  - Compile GSettings schemas"
	@echo "  make check-deps       - Verify required tools are installed"
	@echo "  make status           - Show extension status"

check-deps:
	@printf "$(P_INFO) Checking dependencies...\n"
	@command -v gnome-extensions >/dev/null 2>&1 || { printf "$(P_ERR) gnome-extensions not found\n"; exit 1; }
	@command -v glib-compile-schemas >/dev/null 2>&1 || { printf "$(P_ERR) glib-compile-schemas not found\n"; exit 1; }
	@command -v zip >/dev/null 2>&1 || { printf "$(P_ERR) zip not found\n"; exit 1; }
	@printf "$(P_OK) All dependencies found\n"

status:
	@printf "$(P_INFO) Extension status for $(EXTENSION_UUID)...\n"
	@if [ -d "$(INSTALL_DIR)" ]; then \
		printf "$(P_OK) Extension is installed at $(INSTALL_DIR)\n"; \
	else \
		printf "$(P_WARN) Extension is NOT installed\n"; \
	fi
	@gnome-extensions info $(EXTENSION_UUID) 2>/dev/null || printf "$(P_WARN) Cannot get extension info (GNOME Shell may need restart)\n"

compile-schemas:
	@printf "$(P_INFO) Compiling schemas...\n"
	@if [ ! -d "$(EXTENSION_DIR)/schemas" ]; then \
		printf "$(P_ERR) Schema directory not found: $(EXTENSION_DIR)/schemas\n"; \
		exit 1; \
	fi
	@if glib-compile-schemas $(EXTENSION_DIR)/schemas/ 2>&1; then \
		printf "$(P_OK) Schemas compiled successfully\n"; \
	else \
		printf "$(P_ERR) Schema compilation failed\n"; \
		exit 1; \
	fi

install: check-deps compile-schemas
	@printf "$(P_INFO) Installing $(EXTENSION_UUID)...\n"
	@# Verify source files exist
	@for file in $(FILES); do \
		if [ ! -f "$(EXTENSION_DIR)/$$file" ]; then \
			printf "$(P_ERR) Missing required file: $(EXTENSION_DIR)/$$file\n"; \
			exit 1; \
		fi; \
	done
	@for dir in $(DIRS); do \
		if [ ! -d "$(EXTENSION_DIR)/$$dir" ]; then \
			printf "$(P_ERR) Missing required directory: $(EXTENSION_DIR)/$$dir\n"; \
			exit 1; \
		fi; \
	done
	@mkdir -p $(INSTALL_DIR) || { printf "$(P_ERR) Failed to create install directory\n"; exit 1; }
	@cp -r $(addprefix $(EXTENSION_DIR)/, $(FILES)) $(INSTALL_DIR)/ || { printf "$(P_ERR) Failed to copy files\n"; exit 1; }
	@cp -r $(addprefix $(EXTENSION_DIR)/, $(DIRS)) $(INSTALL_DIR)/ || { printf "$(P_ERR) Failed to copy directories\n"; exit 1; }
	@printf "$(P_OK) Installation complete\n"
	@printf "$(P_WARN) Run 'make enable' to activate, then restart GNOME Shell\n"
	@printf "    (Alt+F2 -> r -> Enter on X11, or log out/in on Wayland)\n"

uninstall: disable
	@printf "$(P_INFO) Uninstalling $(EXTENSION_UUID)...\n"
	@if [ -d "$(INSTALL_DIR)" ]; then \
		rm -rf $(INSTALL_DIR) && printf "$(P_OK) Extension removed\n"; \
	else \
		printf "$(P_WARN) Extension was not installed\n"; \
	fi

enable:
	@printf "$(P_INFO) Enabling $(EXTENSION_UUID)...\n"
	@if [ ! -d "$(INSTALL_DIR)" ]; then \
		printf "$(P_ERR) Extension not installed. Run 'make install' first\n"; \
		exit 1; \
	fi
	@output=$$(gnome-extensions enable $(EXTENSION_UUID) 2>&1); \
	status=$$?; \
	if [ $$status -eq 0 ]; then \
		printf "$(P_OK) Extension enabled successfully\n"; \
	else \
		printf "$(P_ERR) Failed to enable extension (exit code: $$status)\n"; \
		if [ -n "$$output" ]; then \
			printf "$(C_RED)    Error:$(C_NC) %s\n" "$$output"; \
		fi; \
		printf "$(P_WARN) Try restarting GNOME Shell first, then run 'make enable' again\n"; \
		exit 1; \
	fi

disable:
	@printf "$(P_INFO) Disabling $(EXTENSION_UUID)...\n"
	@if gnome-extensions disable $(EXTENSION_UUID) 2>/dev/null; then \
		printf "$(P_OK) Extension disabled\n"; \
	else \
		printf "$(P_WARN) Extension was not enabled or already disabled\n"; \
	fi

reload: install
	@printf "$(P_INFO) Reloading $(EXTENSION_UUID)...\n"
	@gnome-extensions disable $(EXTENSION_UUID) 2>/dev/null || true
	@sleep 0.5
	@gnome-extensions enable $(EXTENSION_UUID) 2>/dev/null || true
	@printf "$(P_WARN) Note: GJS caches imports. If changes don't appear, use 'make dev' or log out/in\n"

DEV_RESOLUTION ?= 2560x1008

dev: install
	@printf "$(P_INFO) Starting nested GNOME Shell ($(DEV_RESOLUTION))...\n"
	@printf "$(P_WARN) This opens a new GNOME Shell window. Close it to stop testing.\n"
	@MUTTER_DEBUG_DUMMY_MODE_SPECS=$(DEV_RESOLUTION) dbus-run-session -- gnome-shell --nested --wayland 2>&1 | grep -v "^$$" || true
	@printf "$(P_OK) Nested session ended\n"

restart:
	@printf "$(P_INFO) Restarting GNOME Shell...\n"
	@if [ "$$XDG_SESSION_TYPE" = "x11" ]; then \
		if busctl --user call org.gnome.Shell /org/gnome/Shell org.gnome.Shell Eval s 'Meta.restart("Restarting...")' 2>/dev/null; then \
			printf "$(P_OK) GNOME Shell restart triggered\n"; \
		else \
			printf "$(P_ERR) Failed to restart GNOME Shell\n"; \
			exit 1; \
		fi; \
	else \
		printf "$(P_WARN) Cannot restart GNOME Shell on Wayland\n"; \
		printf "    Please log out and log back in to apply changes\n"; \
	fi

build: check-deps compile-schemas
	@printf "$(P_INFO) Building extension package...\n"
	@mkdir -p $(BUILD_DIR) || { printf "$(P_ERR) Failed to create build directory\n"; exit 1; }
	@cd $(EXTENSION_DIR) && zip -r ../$(BUILD_DIR)/$(ZIP_NAME) $(FILES) $(DIRS) >/dev/null 2>&1 || { \
		printf "$(P_ERR) Failed to create zip archive\n"; \
		exit 1; \
	}
	@printf "$(P_OK) Package created: $(BUILD_DIR)/$(ZIP_NAME)\n"

deploy: clean build
	@printf "$(P_OK) Extension ready for deployment\n"
	@echo "    Package: $(BUILD_DIR)/$(ZIP_NAME)"
	@echo "    Upload to: https://extensions.gnome.org"

clean:
	@printf "$(P_INFO) Cleaning build artifacts...\n"
	@rm -rf $(BUILD_DIR)
	@rm -f $(EXTENSION_DIR)/schemas/gschemas.compiled
	@printf "$(P_OK) Clean complete\n"
