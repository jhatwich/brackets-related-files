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
/*global define, $, PathUtils, window, brackets */

/*
 * Develop a notion of related files within the scope of the project
 * 
 *
 * FUTURE:
 *  - Augment with resources information from LiveDevelopment's inspector link to an actual running copy of a page being edited
 *  - More granular refresh (don't wait for save)
 */


define(function (require, exports, module) {
    'use strict';
    
    var Async               = brackets.getModule("utils/Async"),
        DocumentManager     = brackets.getModule("document/DocumentManager"),
        ProjectManager      = brackets.getModule("project/ProjectManager"),
        FileIndexManager    = brackets.getModule("project/FileIndexManager"),
        relatedListLookup = {},
        relatedListPromises = {},
        relatedListLoaded = {},
        FILE_TYPES_ALLOWED  = {".css": true, ".js": true, ".less": true, ".svg": true},
        PATH_SEPARATOR = ((brackets.platform === "win") ? "\\" : "/");
    
    function getRelatedFiles(docFile) {
        return relatedListLookup[docFile.fullPath];
    }
    
    function hasLoaded(docFile) {
        return relatedListLoaded[docFile.fullPath];
    }
    
    function _getFirstFolder(filePath) {
        
        var pos = filePath.indexOf(PATH_SEPARATOR),
            folder;
        if (pos > 0) {
            folder = filePath.substring(0, pos);
            return folder;
        }
        return null;
    }
    
    function getRelativeURI(projectPath, filePath, baseFilePath) {
        var rootRelativeURI = filePath.substring(projectPath.length),
            baseRelativeURI = baseFilePath.substring(projectPath.length),
            folderRoot,
            folderBase,
            fileRelativeURI = "",
            backtracking = false;
        
        while (true) {
            
            folderRoot = _getFirstFolder(rootRelativeURI);
            folderBase = _getFirstFolder(baseRelativeURI);
            
            if (!folderBase) {
                fileRelativeURI = rootRelativeURI;
                break;
            } else if (backtracking) {
                rootRelativeURI = "../" + rootRelativeURI;
                baseRelativeURI = baseRelativeURI.substring(folderBase.length + 1);
                
            } else if (folderRoot === folderBase) {
                rootRelativeURI = rootRelativeURI.substring(folderRoot.length + 1);
                baseRelativeURI = baseRelativeURI.substring(folderBase.length + 1);
                
            } else {
                backtracking = true;
                if (PATH_SEPARATOR === "\\") {
                    rootRelativeURI = rootRelativeURI.replace("\\", "/");
                }
                rootRelativeURI = "../" + rootRelativeURI;
				baseRelativeURI = baseRelativeURI.substring(folderBase.length + 1);
            }
        }
        
        return fileRelativeURI;
    }
    
    function _getFileExtension(filePath) {
        var posLast = filePath.lastIndexOf(".");
        if (posLast) {
            return filePath.substring(posLast);
        }
        return "";
    }
    
    function _createRegEx(query) {
        // Escape regex special chars
        var uriQuery = query.replace(/(\(|\)|\{|\}|\[|\]|\.|\^|\$|\||\?|\+|\*)/g, "\\$1");
        return new RegExp(uriQuery, "gi");
    }
    
    function _recordRelationship(fileSrc, fileTarget) {
        if (!relatedListLookup[fileSrc.fullPath]) {
            relatedListLookup[fileSrc.fullPath] = [];
        }
        relatedListLookup[fileSrc.fullPath].push(fileTarget);
    }
    
    
    function findDocRelatedFiles(docFile) {
        
        if (relatedListPromises[docFile.fullPath]) {
            return relatedListPromises[docFile.fullPath].promise();
        }
        
        var masterPromise = new $.Deferred();
        relatedListPromises[docFile.fullPath] = masterPromise;
        
        FileIndexManager.getFileInfoList("all").done(function (fileListResult) {
        
            DocumentManager.getDocumentForPath(docFile.fullPath)
                .done(function (doc) {
                    
                    var docText = doc.getText(),
                        docExtension = _getFileExtension(docFile.fullPath);
                    
                    //TEMPORARY - allow the extension to work if Async.doSequentiallyInBackground isn't there
                    if (!Async.doSequentiallyInBackground) {
                        Async.doSequentially(fileListResult, function (fileEval) {
                            var result = new $.Deferred(),
                                uriEval,
                                extensionEval,
                                uriRegEx;
                            
                            if (fileEval.fullPath !== docFile.fullPath) {
                                
                                uriEval = getRelativeURI(ProjectManager.getProjectRoot().fullPath, fileEval.fullPath, docFile.fullPath);
                    
                                //see if its an allowed file type
                                extensionEval = _getFileExtension(fileEval.fullPath);
                                if (FILE_TYPES_ALLOWED[extensionEval]) {
                        
                                    uriRegEx = _createRegEx(uriEval);
                                    if (docText.search(uriRegEx) !== -1) {
                                        _recordRelationship(docFile, fileEval);
                                        
                                    } else {
                                        if (docExtension === ".js") {
                                            //if our file is a JS then try to find require references that might not have an extension
                                            
                                            uriEval = fileEval.fullPath.substring(ProjectManager.getProjectRoot().fullPath.length);
                                            uriEval = "\"" + uriEval.substring(0, uriEval.length - extensionEval.length) + "\"";
                                            
                                            uriRegEx = _createRegEx(uriEval);
                                            if (docText.search(uriRegEx) !== -1) {
                                                _recordRelationship(docFile, fileEval);
                                            }
                                        }
                                    }
                                }
                            }
                            
                            result.resolve();
                            return result.promise();
                        }, false)
                            .done(function () {
                                relatedListLoaded[docFile.fullPath] = true;
                                masterPromise.resolve();
                            })
                            .fail(function () {
                                console.log("find related files FAILED!");
                                relatedListLoaded[docFile.fullPath] = true;
                                masterPromise.resolve();
                            });
                    } else {
                    
                        //END TEMPORARY CODE (also remove this else)
                        
                        // do the search in the background
                        Async.doSequentiallyInBackground(fileListResult, function (fileEval) {
                            var result = new $.Deferred(),
                                uriEval,
                                extensionEval,
                                uriRegEx;
                            
                            if (fileEval.fullPath !== docFile.fullPath) {
                                
                                uriEval = getRelativeURI(ProjectManager.getProjectRoot().fullPath, fileEval.fullPath, docFile.fullPath);
                    
                                //see if its an allowed file type
                                extensionEval = _getFileExtension(fileEval.fullPath);
                                if (FILE_TYPES_ALLOWED[extensionEval]) {
                        
                                    uriRegEx = _createRegEx(uriEval);
                                    if (docText.search(uriRegEx) !== -1) {
                                        _recordRelationship(docFile, fileEval);
                                        
                                    } else {
                                        if (docExtension === ".js") {
                                            //if our file is a JS then try to find require references that might not have an extension
                                            
                                            uriEval = fileEval.fullPath.substring(ProjectManager.getProjectRoot().fullPath.length);
                                            uriEval = "\"" + uriEval.substring(0, uriEval.length - extensionEval.length) + "\"";
                                            
                                            uriRegEx = _createRegEx(uriEval);
                                            if (docText.search(uriRegEx) !== -1) {
                                                _recordRelationship(docFile, fileEval);
                                            }
                                        }
                                    }
                                }
                            }
                            
                            result.resolve();
                            return result.promise();
                        }, 20, 30)
                            .done(function () {
                                relatedListLoaded[docFile.fullPath] = true;
                                masterPromise.resolve();
                            })
                            .fail(function () {
                                console.log("find related files FAILED!");
                                relatedListLoaded[docFile.fullPath] = true;
                                masterPromise.resolve();
                            });
                    }
                })
                .fail(function (error) {
                    // Error reading this file. This is most likely because the file isn't a text file.
                    // Resolve here so we move on to the next file.
                    relatedListLoaded[docFile.fullPath] = true;
                    masterPromise.resolve();
                });
        });
        
        return masterPromise.promise();
    }
    
    function _onWorkingSetAdd(event, fileAdded) {
        findDocRelatedFiles(fileAdded);
    }
    
    function _onWorkingSetAddList(event, fileList) {
        $.each(fileList, function (fileItem) {
            findDocRelatedFiles(fileItem);
        });
    }
    
    function _onDocumentSaved(event, docSaved) {
        relatedListPromises[docSaved.file.fullPath] = null;
        relatedListLookup[docSaved.file.fullPath] = null;
        relatedListLoaded[docSaved.file.fullPath] = null;
        
        findDocRelatedFiles(docSaved.file);
    }
    
    function _onProjectRootChanged(event, projectRoot) {
        relatedListLookup = {};
        relatedListLoaded = {};
        relatedListPromises = {};
    }

    // Initialize: register listeners
    $(DocumentManager).on("workingSetAdd", _onWorkingSetAdd);
    $(DocumentManager).on("documentSaved", _onDocumentSaved);
    $(ProjectManager).on("projectOpen", _onProjectRootChanged);
    $(DocumentManager).on("workingSetAddList", _onWorkingSetAddList);
    
    exports.hasLoaded = hasLoaded;
    exports.getRelatedFiles = getRelatedFiles;
    exports.getRelativeURI = getRelativeURI;
    exports.findDocRelatedFiles = findDocRelatedFiles;
});