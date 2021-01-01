# TF2 Botcheck

## Requirements
- Node.js (with npm) >= 10

## Installation
1. [Download](https://github.com/H-s-O/tf2-botcheck/archive/develop.zip) the repository
1. Double-click `install.bat` to install dependencies
1. Add `-condebug -conclearlog` to TF2's [launch options](https://support.steampowered.com/kb_article.php?ref=1040-JWMT-2947&l=english) if not already present
1. [Enable TF2 console](https://plair.zendesk.com/hc/en-us/articles/360036268733-Team-Fortress-2-Enable-Console-Command-) if not already enabled

## Usage
To trigger the bot checking, execute `botcheck.bat` while you are playing a game in TF2 and TF2 is the frontmost application.

A way of doing this is using a software like
[WinHotKey](https://directedge.us/content/winhotkey) to have a custom hotkey launch the `botcheck.bat`. If you have a Stream Deck, you can add a [Open](https://help.elgato.com/hc/en-us/articles/360028234471-Elgato-Stream-Deck-System-Actions) action that executes the `botcheck.bat`.

Remember that since this script interacts with the TF2 console via virtual keypresses, you must not press any keyboard key (and not click your mouse) while the script is running.

## ToDo (in no particular order)
- Settings to configure the TF2 console key & console log file path
- Auto-update bot list
- Background interaction with TF2 (instead of simulated keyboard interactions with console)