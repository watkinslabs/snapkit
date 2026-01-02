# SnapKit GNOME Extension Makefile

EXTENSION_UUID = snapkit@watkinslabs
EXTENSION_DIR = $(EXTENSION_UUID)
INSTALL_DIR = ~/.local/share/gnome-shell/extensions/$(EXTENSION_UUID)
BUILD_DIR = build
ZIP_NAME = $(EXTENSION_UUID).shell-extension.zip

# Extension files to install/package
FILES = extension.js prefs.js metadata.json stylesheet.css
DIRS = lib layouts schemas

.PHONY: help install uninstall enable disable restart clean deploy build compile-schemas

help:
	@echo "SnapKit Extension - Available targets:"
	@echo "  make install          - Install extension to user directory"
	@echo "  make uninstall        - Remove extension from user directory"
	@echo "  make enable           - Enable the extension"
	@echo "  make disable          - Disable the extension"
	@echo "  make restart          - Restart GNOME Shell (X11 only)"
	@echo "  make deploy           - Create distributable zip file"
	@echo "  make clean            - Remove build artifacts"
	@echo "  make compile-schemas  - Compile GSettings schemas"

compile-schemas:
	@echo "Compiling schemas..."
	@glib-compile-schemas $(EXTENSION_DIR)/schemas/

install: compile-schemas
	@echo "Installing $(EXTENSION_UUID)..."
	@mkdir -p $(INSTALL_DIR)
	@cp -r $(addprefix $(EXTENSION_DIR)/, $(FILES)) $(INSTALL_DIR)/
	@cp -r $(addprefix $(EXTENSION_DIR)/, $(DIRS)) $(INSTALL_DIR)/
	@echo "Installation complete. Run 'make enable' to activate the extension."
	@echo "Then restart GNOME Shell (Alt+F2, type 'r', press Enter on X11, or log out/in on Wayland)"

uninstall: disable
	@echo "Uninstalling $(EXTENSION_UUID)..."
	@rm -rf $(INSTALL_DIR)
	@echo "Uninstallation complete."

enable:
	@echo "Enabling $(EXTENSION_UUID)..."
	@gnome-extensions enable $(EXTENSION_UUID)
	@echo "Extension enabled."

disable:
	@echo "Disabling $(EXTENSION_UUID)..."
	@-gnome-extensions disable $(EXTENSION_UUID) 2>/dev/null || true
	@echo "Extension disabled."

restart:
	@echo "Restarting GNOME Shell (X11 only)..."
	@if [ "$$XDG_SESSION_TYPE" = "x11" ]; then \
		busctl --user call org.gnome.Shell /org/gnome/Shell org.gnome.Shell Eval s 'Meta.restart("Restarting…")'; \
	else \
		echo "Cannot restart GNOME Shell on Wayland. Please log out and log back in."; \
	fi

build: compile-schemas
	@echo "Building extension package..."
	@mkdir -p $(BUILD_DIR)
	@cd $(EXTENSION_DIR) && zip -r ../$(BUILD_DIR)/$(ZIP_NAME) $(FILES) $(DIRS)
	@echo "Package created: $(BUILD_DIR)/$(ZIP_NAME)"

deploy: clean build
	@echo "Extension ready for deployment at $(BUILD_DIR)/$(ZIP_NAME)"
	@echo "You can upload this to https://extensions.gnome.org"

clean:
	@echo "Cleaning build artifacts..."
	@rm -rf $(BUILD_DIR)
	@rm -f $(EXTENSION_DIR)/schemas/gschemas.compiled
	@echo "Clean complete."
