/*
 * Copyright (c) 2012 Adobe Systems Incorporated. All rights reserved.
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
/*global define, brackets, window, $, document */


define(function (require, exports, module) {
    'use strict';
    
    var PREFERENCES_KEY = "com.adobe.brackets.brackets-related-files";
    
    // Brackets modules
    var DocumentManager         = brackets.getModule("document/DocumentManager"),
        ProjectManager          = brackets.getModule("project/ProjectManager"),
        PreferencesManager      = brackets.getModule("preferences/PreferencesManager"),
        Commands                = brackets.getModule("command/Commands"),
        CommandManager          = brackets.getModule("command/CommandManager"),
        FileViewController      = brackets.getModule("project/FileViewController"),
        strings                 = brackets.getModule("strings"),
        RelatedFiles            = require("RelatedFiles"),
        _FILE_KEY                = "file",
        $openFilesContainer;
    
    
    function loadStyles(relPath) {
        $("<link rel='stylesheet' type='text/css'></link>")
            .attr("href", require.toUrl("./" + relPath))
            .appendTo(document.head);
    }
    
    // Initialize extension
    loadStyles("styles.css");
    
    //insturment the DOM
    //$("#project-title").wrap("<div id='project-dropdown-toggle'></div>").after("<span class='dropdown-arrow'></span>");
    //$dropdownToggle = $("#project-dropdown-toggle").click(toggle);
    $openFilesContainer     = $("#open-files-container");
    
    //this is duplicated in WorkingSetView... but it isn't clear how to call it properly
    function _adjustForScrollbars() {
        var $container = $("#open-files-container");
        if ($container[0].scrollHeight > $container[0].clientHeight) {
            if (!$container.hasClass("vertical-scroll")) {
                $container.addClass("vertical-scroll");
            }
        } else {
            $container.removeClass("vertical-scroll");
        }
    }
    
    function _toggleRelatedFilesDisplay($listItem, open) {
        
        var $relatedFiles = $($listItem.children(".working-set-related-files")[0]),
            $relatedFilesLink = $($listItem.children(".working-set-related-link")[0]);
        
        if (open) {
            $listItem.addClass("related-opened");
        } else {
            $listItem.removeClass("related-opened");
            $relatedFiles.empty();
        }
        _adjustForScrollbars();
    }
    
    function _bindRelatedFileLink($item, $relatedFiles, $relatedFilesLink, $relatedFile, file) {
        
        $relatedFile.click(function () {
            _toggleRelatedFilesDisplay($item, false);
            
            DocumentManager.getDocumentForPath(file.fullPath)
                .done(function (doc) {
                    //$(DocumentManager).triggerHandler("dirtyFlagChange", doc);
                    
                    var $fileStatusIcon = $item.find(".file-status-icon");
                    if ($fileStatusIcon.length !== 0) {
                        $fileStatusIcon.toggleClass("can-close", false);
                        if (!doc.isDirty) {
                            $fileStatusIcon.remove();
                        }
                    }
                
                    window.setTimeout(function () {
                        FileViewController.addToWorkingSetAndSelect(file.fullPath);
                    }, 0);
                });
            return false;
        });
    }
    
    function _updateRelatedFilesStatus(file, $item) {
        
        var relatedFiles = RelatedFiles.getRelatedFiles(file);
        if (relatedFiles && relatedFiles.length > 0) {
            if (!$item.hasClass("has-related-files")) {
                $item.addClass("has-related-files");
            }
        } else {
            $item.removeClass("has-related-files");
        }
    }
    
    function _populateRelatedFiles($item, $relatedFiles, $relatedFilesLink, file) {
        var relatedFiles = RelatedFiles.getRelatedFiles(file),
            pathDisplay,
            pathTooltip,
            $relatedFile,
            i;
        $relatedFiles.empty();
        
        for (i = 0; relatedFiles && i < relatedFiles.length; i = i + 1) {
                    
            pathDisplay = relatedFiles[i].fullPath.substring(ProjectManager.getProjectRoot().fullPath.length);
            pathTooltip = RelatedFiles.getRelativeURI(ProjectManager.getProjectRoot().fullPath, relatedFiles[i].fullPath, file.fullPath);
                    
            $relatedFile = $("<a href='#'></a>").text(pathDisplay);
            $relatedFile.attr("title", pathTooltip);
            $relatedFiles.append($relatedFile);
                    
            _bindRelatedFileLink($item, $relatedFiles, $relatedFilesLink, $relatedFile, relatedFiles[i]);
        }
        
        _adjustForScrollbars();
    }
    
    function _findWorkingSetItemForFile(file) {
        var $ret;
        $openFilesContainer.find("ul").children().each(function () {
            if ($(this).data(_FILE_KEY).fullPath === file.fullPath) {
                $ret = $(this);
            }
        });
        
        return $ret;
    }
    
    
    
    //listen to events
    $(ProjectManager).on("initializeComplete", function () {
        
    });
    
    $(DocumentManager).on("documentSaved", function (event, doc) {
        window.setTimeout(function () {
            
            // Iterate through working set list and update the selection on each
            var items = $openFilesContainer.find("ul").children().each(function () {
                if ($(this).data(_FILE_KEY).fullPath === doc.file.fullPath) {
                    if ($(this).hasClass("related-opened")) {
                        var $relatedFiles = $($(this).children(".working-set-related-files")[0]),
                            $relatedFilesLink = $($(this).children(".working-set-related-files-link")[0]);
                        $relatedFiles.empty();
                        _populateRelatedFiles($(this), $relatedFiles, $relatedFilesLink, doc.file);
                    }
                }
            });
        }, 10);
        
    });
    
    
    $(DocumentManager).on("workingSetAdd", function (event, addedFile) {
    
        var $relatedFilesLink = $("<a class='working-set-related-link' href='#'></a>").html("&laquo;");
        var $relatedFiles = $("<div class='working-set-related-files'></div>");
        
        var $ele = _findWorkingSetItemForFile(addedFile);
        if ($ele) {
            $ele.append($relatedFilesLink).append($relatedFiles);
            
            $ele.hover(
                function () {
                    _updateRelatedFilesStatus(addedFile, $ele);
                },
                function () {}
            );

            $relatedFilesLink.click(function () {
                var relatedFiles,
                    i,
                    $relatedFile,
                    pathDisplay,
                    pathTooltip;
                
                if (!$ele.hasClass("related-opened")) {
                    _toggleRelatedFilesDisplay($ele, true);
                    _populateRelatedFiles($ele, $relatedFiles, $relatedFilesLink, addedFile);
                    
                } else {
                    _toggleRelatedFilesDisplay($ele, false);
                }
            });
        }
        
    });
    
    $(DocumentManager).on("currentDocumentChange", function (event) {
        
        var doc = DocumentManager.getCurrentDocument();
        if (doc) {
            
            window.setTimeout(function () {
                var $ele = _findWorkingSetItemForFile(doc.file);
                if ($ele) {
                    if (RelatedFiles.hasLoaded(doc.file)) {
                        _updateRelatedFilesStatus(doc.file, $ele);
                    }
                }
            }, 0);
        }
    });
    
});
