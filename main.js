/*
 * Copyright (c) 2012 Jeffry Booher. All rights reserved.
 *  
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"), 
 * to deal in the Software without restriction, including without limitation 
 * the rights to use, copy, modify, merge, publish, distribute, sublicense, 
 * and/or sell copies of the Software, and to permit persons to whom the 
 * Software is furnished to do so, subject to the following conditions:
 *  
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *  
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING 
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER 
 * DEALINGS IN THE SOFTWARE.
 * 
 */

/*jslint vars: true, plusplus: true, devel: true, nomen: true, regexp: true, indent: 4, maxerr: 50 */
/*global define, brackets, $ */

define(function (require, exports, module) {
    "use strict";
    
    // Brackets modules
    var PreferencesManager          = brackets.getModule("preferences/PreferencesManager"),
        CommandManager              = brackets.getModule("command/CommandManager"),
        ExtensionUtils              = brackets.getModule("utils/ExtensionUtils"),
        Menus                       = brackets.getModule("command/Menus"),
        EditorManager               = brackets.getModule("editor/EditorManager"),
        _                           = brackets.getModule("thirdparty/lodash");
    
    // my modules
    var BookmarksView               = require("view/BookmarksView").BookmarksView,
        ExtensionStrings            = require("strings");
    

    /** @const {string} Extension Command ID */
    var MY_MODULENAME               = "bracketsBookmarksExtension";
    var CMD_TOGGLE_BOOKMARK         = "bracketsBookmarksExtension.toggleBookmark",
        CMD_GOTO_NEXT_BOOKMARK      = "bracketsBookmarksExtension.gotoNextBookmark",
        CMD_GOTO_PREV_BOOKMARK      = "bracketsBookmarksExtension.gotoPrevBookmark",
        CMD_TOGGLE_BOOKKMARK_VIEW   = "bracketsBookmarksExtension.toggleBookmarksPanel";
    
    /* Our extension's preferences */
    var prefs = PreferencesManager.getPreferenceStorage(module);
    
    // Bookmarks Data Model
    var _bookmarks = {};
    
    // Bookmarks Panel
    var _bookmarksPanel = null;
    
    /**
     * Saves bookmarks to the data model for the specified editor instance 
     * @param {Editor=} editor - brackets editor instance. current editor if null
     * @return {?Array.<Number>} array of cached bookmarked line numbers
     */
    function saveBookmarks(editor) {
        if (!editor) {
            editor = EditorManager.getCurrentFullEditor();
        }
        if (editor) {
            var i,
                fullPath = editor.document.file.fullPath,
                cm = editor._codeMirror,
                lineCount = cm.doc.lineCount(),
                bookmarkedLines = [];
        
            for (i = 0; i < lineCount; i++) {
                var lineInfo = cm.lineInfo(i);
            
                if (lineInfo.wrapClass && lineInfo.wrapClass.indexOf("bookmark") >= 0) {
                    bookmarkedLines.push(i);
                }
            }
            
            // we need to sort so that go to next bookmark works
            bookmarkedLines.sort(function (a, b) {
                return a > b;
            });
        
            _bookmarks[fullPath] = bookmarkedLines;
            prefs.set("bookmarks", _bookmarks);

            $(_bookmarks).triggerHandler("change");

            // return the bookmarks for the editor
            return bookmarkedLines;
        }
        return null;
    }
    
    /**
     * Updates bookmarks for the current editor if necessary
     * @param {Editor=} editor - brackets editor instance. current editor if null
     * @return {Boolean} true if there are bookmarks for the current editor, false if not
     */
    function updateBookmarksForCurrentEditor() {
        var result = false,
            editor = EditorManager.getCurrentFullEditor();
        if (editor) {
            var fullPath = editor.document.file.fullPath,
                bm = _bookmarks[fullPath];

            // if there was already data then we 
            //  don't need to rebuild it
            result = (bm && bm.length);
            
            if (!result) {
                // there was no deta for this file so 
                //  rebuild the model just for this file
                //  from what is in the editor currently
                result = Boolean(saveBookmarks(editor));
            }
        }
        
        return result;
    }
    
    /**
     * Resets the bookmarks for the file opened in the specified editor
     * NOTE: When the bookmarks for the current editor are needed 
     *          (for traversal or to update the bookmarks panel), 
     *          updateBookmarksForCurrentEditor is called which updates
     *          incrementally the bookmarks for the current file
     * @param {!Editor} editor - brackets editor instance
     */
    function resetBookmarks(editor) {
        if (editor) {
            delete _bookmarks[editor.document.file.fullPath];
            $(_bookmarks).triggerHandler("change");
        }
    }
    
    /**
     * Loads the cached bookmarks into the specified editor instance
     * @param {Editor=} editor - brackets editor instance. current editor if null
     */
    function loadBookmarks(editor) {
        if (!editor) {
            editor = EditorManager.getCurrentFullEditor();
        }
        if (editor) {
            var cm = editor._codeMirror,
                bm = _bookmarks[editor.document.file.fullPath];
            
            if (bm) {
                bm.forEach(function (lineNo) {
                    if (lineNo < cm.doc.lineCount()) {
                        cm.addLineClass(lineNo, "wrap", "bookmark");
                    }
                });
            }
        }
    }

    /**
     * Moves the cursor position of the current editor to the next bookmark 
     * @param {!Editor} editor - brackets editor instance
     */
    function gotoNextBookmark(forward) {
        if (updateBookmarksForCurrentEditor()) {
            var editor = EditorManager.getCurrentFullEditor(),
                cursor = editor.getCursorPos(),
                bm = _bookmarks[editor.document.file.fullPath];

            var doJump = function (lineNo) {
                editor.setCursorPos(lineNo, 0);

                var cm = editor._codeMirror;
                cm.addLineClass(lineNo, "wrap", "bookmark-notify");
                setTimeout(function () {
                    cm.removeLineClass(lineNo, "wrap", "bookmark-notify");
                }, 100);
            };
            
            // find next bookmark
            var index;
            for (index = (forward ? 0 : bm.length - 1); forward ? (index < bm.length) : (index >= 0); forward ? (index++) : (index--)) {
                if (forward) {
                    if (bm[index] > cursor.line) {
                        doJump(bm[index]);
                        return;
                    }
                    if (index === bm.length - 1) {
                        // wrap around just pick the first one in the list
                        if (bm[0] !== cursor.line) {
                            doJump(bm[0]);
                        }
                        return;
                    }
                } else {
                    if (bm[index] < cursor.line) {
                        doJump(bm[index]);
                        return;
                    }
                    if (index === 0) {
                        // wrap around just pick the last one in the list
                        if (bm[bm.length - 1] !== cursor.line) {
                            doJump(bm[bm.length - 1]);
                        }
                        return;
                    }
                }
            }
        }
    }
    
    /**
     * Toogles the bookmarked state of the current line of the current editor
     */
    function toggleBookmark() {
        var editor = EditorManager.getCurrentFullEditor();
        if (editor) {
            var cursor = editor.getCursorPos(),
                lineNo = cursor.line,
                cm = editor._codeMirror,
                lineInfo = cm.lineInfo(cursor.line);
            
            if (!lineInfo.wrapClass || lineInfo.wrapClass.indexOf("bookmark") === -1) {
                cm.addLineClass(lineNo, "wrap", "bookmark");
            } else {
                cm.removeLineClass(lineNo, "wrap", "bookmark");
            }
            resetBookmarks(editor);
        }
    }
    
    /**
     * Creates and/or Shows or Hides the bookmarks panel
     */
    function toggleBookmarksPanel() {
        if (!_bookmarksPanel) {
            _bookmarksPanel = new BookmarksView(_bookmarks, updateBookmarksForCurrentEditor);

            $(_bookmarksPanel).on("close", function () {
                CommandManager.get(CMD_TOGGLE_BOOKKMARK_VIEW).setChecked(_bookmarksPanel.isOpen());
            });
        }
        
        if (_bookmarksPanel.isOpen()) {
            _bookmarksPanel.close();
        } else {
            _bookmarksPanel.open();
        }

        CommandManager.get(CMD_TOGGLE_BOOKKMARK_VIEW).setChecked(_bookmarksPanel.isOpen());
    }
    
    // load our styles
    ExtensionUtils.loadStyleSheet(module, "styles/styles.css");
    
    // register our commands
    CommandManager.register(ExtensionStrings.TOGGLE_BOOKMARK, CMD_TOGGLE_BOOKMARK, toggleBookmark);
    CommandManager.register(ExtensionStrings.GOTO_PREV_BOOKMARK, CMD_GOTO_PREV_BOOKMARK, _.partial(gotoNextBookmark, false));
    CommandManager.register(ExtensionStrings.GOTO_NEXT_BOOKMARK, CMD_GOTO_NEXT_BOOKMARK, _.partial(gotoNextBookmark, true));
    
    // add our menu items
    var menu = Menus.getMenu(Menus.AppMenuBar.NAVIGATE_MENU);

    menu.addMenuDivider();
    menu.addMenuItem(CMD_TOGGLE_BOOKMARK, "Ctrl-Shift-K");
    menu.addMenuItem(CMD_GOTO_NEXT_BOOKMARK, "Ctrl-P");
    menu.addMenuItem(CMD_GOTO_PREV_BOOKMARK, "Ctrl-Shift-P");
    
    menu = Menus.getMenu(Menus.AppMenuBar.VIEW_MENU);
    CommandManager.register(ExtensionStrings.TOGGLE_BOOKMARKS_PANEL, CMD_TOGGLE_BOOKKMARK_VIEW, toggleBookmarksPanel);
    menu.addMenuDivider();
    menu.addMenuItem(CMD_TOGGLE_BOOKKMARK_VIEW);
    
    _bookmarks = prefs.get("bookmarks") || {};
    
    // event handlers
    //  note: this is an undocumented, unsupported event when an editor is created
    // @TODO: invent a standard event
    $(EditorManager).on("_fullEditorCreatedForDocument", function (e, document, editor) {
        $(editor).on("beforeDestroy.bookmarks", function () {
            saveBookmarks(editor);
            $(editor).off(".bookmarks");
            $(document).off(".bookmarks");
        });
        $(document).on("change.bookmarks", function () {
            resetBookmarks(editor);
        });
        loadBookmarks(editor);
    });
});
