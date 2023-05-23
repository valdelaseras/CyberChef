/**
 * @author n1474335 [n1474335@gmail.com]
 * @copyright Crown Copyright 2016
 * @license Apache-2.0
 */

import HTMLOperation from "../HTMLOperation.mjs";
import Sortable from "sortablejs";
import {fuzzyMatch, calcMatchRanges} from "../../core/lib/FuzzyMatch.mjs";

/**
 * Waiter to handle events related to the operations.
 */
class OperationsWaiter {

    /**
     * OperationsWaiter constructor.
     *
     * @param {App} app - The main view object for CyberChef.
     * @param {Manager} manager - The CyberChef event manager.
     */
    constructor(app, manager) {
        this.app = app;
        this.manager = manager;

        this.options = {};
        this.removeIntent = false;
    }


    /**
     * Handler for search events.
     * Finds operations which match the given search term and displays them under the search box.
     *
     * @param {event} e
     */
    searchOperations(e) {
        let ops, selected;

        if (e.type === "keyup") {
            const searchResults = document.getElementById("search-results");

            this.openOpsDropdown();

            if (e.target.value.length !== 0) {
                this.app.setElementVisibility(searchResults, true);
            }
        }

        if (e.type === "search" || e.keyCode === 13) { // Search or Return
            e.preventDefault();
            ops = document.querySelectorAll("#search-results li");
            if (ops.length) {
                selected = this.getSelectedOp(ops);
                if (selected > -1) {
                    this.manager.recipe.addOperation(ops[selected].getAttribute("data-name"));
                }
            }
        }

        if (e.type === "click" && !e.target.value.length) {
            this.openOpsDropdown();
        } else if (e.keyCode === 27) { // Escape
            this.closeOpsDropdown();
        } else if (e.keyCode === 40) { // Down
            e.preventDefault();
            ops = document.querySelectorAll("#search-results li");
            if (ops.length) {
                selected = this.getSelectedOp(ops);
                if (selected > -1) {
                    ops[selected].classList.remove("selected-op");
                }
                if (selected === ops.length-1) selected = -1;
                ops[selected+1].classList.add("selected-op");
            }
        } else if (e.keyCode === 38) { // Up
            e.preventDefault();
            ops = document.querySelectorAll("#search-results li");
            if (ops.length) {
                selected = this.getSelectedOp(ops);
                if (selected > -1) {
                    ops[selected].classList.remove("selected-op");
                }
                if (selected === 0) selected = ops.length;
                ops[selected-1].classList.add("selected-op");
            }
        } else {
            const searchResultsEl = document.getElementById("search-results");
            const el = e.target;
            const str = el.value;

            while (searchResultsEl.firstChild) {
                try {
                    $(searchResultsEl.firstChild).popover("dispose");
                } catch (err) {}
                searchResultsEl.removeChild(searchResultsEl.firstChild);
            }

            $("#categories .show").collapse("hide");
            if (str) {
                const matchedOps = this.filterOperations(str, true);
                const matchedOpsHtml = matchedOps
                    .map(v => v.toStubHtml())
                    .join("");

                searchResultsEl.innerHTML = matchedOpsHtml;
                searchResultsEl.dispatchEvent(this.manager.oplistcreate);
            }
            this.manager.ops.updateListItemsClasses("#rec-list", "selected");
        }
    }


    /**
     * Filters operations based on the search string and returns the matching ones.
     *
     * @param {string} searchStr
     * @param {boolean} highlight - Whether to highlight the matching string in the operation
     *   name and description
     * @returns {string[]}
     */
    filterOperations(inStr, highlight) {
        const matchedOps = [];
        const matchedDescs = [];

        // Create version with no whitespace for the fuzzy match
        // Helps avoid missing matches e.g. query "TCP " would not find "Parse TCP"
        const inStrNWS = inStr.replace(/\s/g, "");

        for (const opName in this.app.operations) {
            const op = this.app.operations[opName];

            // Match op name using fuzzy match
            const [nameMatch, score, idxs] = fuzzyMatch(inStrNWS, opName);

            // Match description based on exact match
            const descPos = op.description.toLowerCase().indexOf(inStr.toLowerCase());

            if (nameMatch || descPos >= 0) {
                const operation = new HTMLOperation(opName, this.app.operations[opName], this.app, this.manager);

                if (highlight) {
                    operation.highlightSearchStrings(calcMatchRanges(idxs), [[descPos, inStr.length]]);
                }

                if (nameMatch) {
                    matchedOps.push([operation, score]);
                } else {
                    matchedDescs.push(operation);
                }
            }
        }

        // Sort matched operations based on fuzzy score
        matchedOps.sort((a, b) => b[1] - a[1]);

        return matchedOps.map(a => a[0]).concat(matchedDescs);
    }


    /**
     * Finds the operation which has been selected using keyboard shortcuts. This will have the class
     * 'selected-op' set. Returns the index of the operation within the given list.
     *
     * @param {element[]} ops
     * @returns {number}
     */
    getSelectedOp(ops) {
        for (let i = 0; i < ops.length; i++) {
            if (ops[i].classList.contains("selected-op")) {
                return i;
            }
        }
        return -1;
    }


    /**
     * Handler for oplistcreate events.
     *
     * @listens Manager#oplistcreate
     * @param {event} e
     */
    opListCreate(e) {
        if (this.app.isMobileView()) {
            this.createMobileOpList(e);
        } else {
            this.createDesktopOpList(e);
        }
    }

    /**
     * Create the desktop op-list which allows popovers
     * and dragging
     *
     * @param {event} e
     */
    createDesktopOpList(e) {
        this.manager.recipe.createSortableSeedList(e.target);
        this.enableOpPopover(e.target);
    }

    /**
     * Create the mobile op-list which does not allow
     * popovers and dragging
     *
     * @param {event} e
     */
    createMobileOpList(e) {
        this.manager.recipe.createSortableSeedList(e.target, false);
        this.disableOpsListPopovers();
    }


    /**
     * Enable the target operation popover itself to gain focus which
     * enables scrolling and other interactions.
     *
     * @param {Element} el - The element to start selecting from
     */
    enableOpPopover(el) {
        $(el).find("[data-toggle=popover]").addBack("[data-toggle=popover]")
            .popover({trigger: "manual"})
            .on("mouseenter", function(e) {
                if (e.buttons > 0) return; // Mouse button held down - likely dragging an operation
                const _this = this;
                $(this).popover("show");
                $(".popover").on("mouseleave", function () {
                    $(_this).popover("hide");
                });
            }).on("mouseleave", function () {
                const _this = this;
                setTimeout(function() {
                    // Determine if the popover associated with this element is being hovered over
                    if ($(_this).data("bs.popover") &&
                        ($(_this).data("bs.popover").tip && !$($(_this).data("bs.popover").tip).is(":hover"))) {
                        $(_this).popover("hide");
                    }
                }, 50);
            });
    }


    /**
     * Disable popovers on all op-list list items
     */
    disableOpsListPopovers() {
        $(document.querySelectorAll(".op-list .operation")).popover("disable");
    }


    /**
     * Handler for operation doubleclick events.
     * Adds the operation to the recipe and auto bakes.
     *
     * @param {event} e
     */
    operationDblclick(e) {
        const li = e.target;
        this.manager.recipe.addOperation(li.getAttribute("data-name"));
    }


    /**
     * Handler for edit favourites click events.
     * Sets up the 'Edit favourites' pane and displays it.
     *
     * @param {event} e
     */
    editFavouritesClick(e) {
        e.preventDefault();
        e.stopPropagation();

        // Add favourites to modal
        const favCat = this.app.categories.filter(function(c) {
            return c.name === "Favourites";
        })[0];

        let html = "";
        for (let i = 0; i < favCat.ops.length; i++) {
            const opName = favCat.ops[i];
            const operation = new HTMLOperation(opName, this.app.operations[opName], this.app, this.manager);
            html += operation.toStubHtml(true);
        }

        const editFavouritesList = document.getElementById("edit-favourites-list");
        editFavouritesList.innerHTML = html;
        this.removeIntent = false;

        const editableList = Sortable.create(editFavouritesList, {
            filter: ".remove-icon",
            onFilter: function (evt) {
                const el = editableList.closest(evt.item);
                if (el && el.parentNode) {
                    $(el).popover("dispose");
                    el.parentNode.removeChild(el);
                }
            },
            onEnd: function(evt) {
                if (this.removeIntent) {
                    $(evt.item).popover("dispose");
                    evt.item.remove();
                }
            }.bind(this),
        });

        Sortable.utils.on(editFavouritesList, "dragleave", function() {
            this.removeIntent = true;
        }.bind(this));

        Sortable.utils.on(editFavouritesList, "dragover", function() {
            this.removeIntent = false;
        }.bind(this));

        if (!this.app.isMobileView()) {
            $("#edit-favourites-list [data-toggle=popover]").popover();
        }
        $("#favourites-modal").modal();
    }


    /**
     * Open operations dropdown
     */
    openOpsDropdown() {
        // the 'close' ( dropdown ) icon in Operations component mobile UI
        const closeOpsDropdownIcon = document.getElementById("close-ops-dropdown-icon");
        const categories = document.getElementById("categories");

        this.app.setElementVisibility(categories, true);
        this.app.setElementVisibility(closeOpsDropdownIcon, true);
    }


    /**
     * Hide any operation lists ( #categories or #search-results ) and the close-operations-dropdown
     * icon itself, clear any search input
     */
    closeOpsDropdown() {
        const search = document.getElementById("search");

        // if any input remains in #search, clear it
        if (search.value.length) {
            search.value = "";
        }

        this.app.setElementVisibility(document.getElementById("categories"), false);
        this.app.setElementVisibility(document.getElementById("search-results"), false);
        this.app.setElementVisibility(document.getElementById("close-ops-dropdown-icon"), false);
    }

    /**
     * Handler for save favourites click events.
     * Saves the selected favourites and reloads them.
     */
    saveFavouritesClick() {
        const favs = document.querySelectorAll("#edit-favourites-list li");
        const favouritesList = Array.from(favs, e => e.childNodes[0].textContent);

        this.app.updateFavourites(favouritesList);
    }


    /**
     * Handler for reset favourites click events.
     * Resets favourites to their defaults.
     */
    resetFavouritesClick() {
        this.app.resetFavourites();
    }


    /**
     * Add op to Favourites and add the 'favourite' class to the list item,
     * set the star icon to a filled star
     *
     * @param {Event} e
     */
    onIconFavouriteClick(e) {
        this.app.addFavourite(e.target.getAttribute("title"));
        document.querySelectorAll(`li[data-name="${e.target.getAttribute("title")}"]`).forEach(listItem => {
            listItem.querySelector("i.star-icon").innerText = "star";
            listItem.classList.add("favourite");
        });
    }


    /**
     * Update classes in the #dropdown-operations op-lists based on the
     * list items of a srcListSelector.
     *
     * e.g: the operations currently listed in the recipe-list and the appropriate
     * list items in operations-dropdown that need to have the 'selected' class added
     * or removed. Another use case is using the current 'Favourite' category op-list
     * as a source and handle the 'favourite' class on operations-dropdown op-lists
     * accordingly
     *
     * @param {string} srcListSelector - the UL element list to compare to
     * @param {string} className - the className to update
     */
    updateListItemsClasses(srcListSelector, className) {
        const listItems = document.querySelectorAll(`${srcListSelector} > li`);
        const ops =  document.querySelectorAll(".op-list > li.operation");

        this.removeClassFromOps(className);

        if (listItems.length !== 0) {
            listItems.forEach((item => {
                const targetDataName = item.getAttribute("data-name");

                ops.forEach((op) => {
                    if (targetDataName === op.getAttribute("data-name")) {
                        this.addClassToOp(targetDataName, className);
                    }
                });
            }));
        }
    }


    /**
     * Set 'favourite' classes to all ops currently listed in the Favourites
     * category, and update the ops-list operation favourite icons
     */
    updateOpsFavouriteIcons() {
        this.updateListItemsClasses("#catFavourites > .op-list", "favourite");
        document.querySelectorAll("li.operation.favourite > i.star-icon").forEach((icon) => {
            icon.innerText = "star";
        });
        document.querySelectorAll("li.operation:not(.favourite) > i.star-icon").forEach((icon) => {
            icon.innerText = "star_outline";
        });
    }


    /**
     * Generic function to remove a class from > ALL < operation list items
     *
     * @param {string} className  - the class to remove
     */
    removeClassFromOps(className) {
        const ops = document.querySelectorAll(".op-list > li.operation");

        ops.forEach((op => {
            this.removeClassFromOp(op.getAttribute("data-name"), className);
        }));
    }


    /**
     * Generic function to remove a class from target operation list item
     *
     * @param {string} opDataName - data-name attribute of the target operation
     * @param {string} className - the class to remove
     */
    removeClassFromOp(opDataName, className) {
        const ops = document.querySelectorAll(`.op-list > li.operation[data-name="${opDataName}"].${className}`);

        // the same operation may occur twice if it is also in #catFavourites
        ops.forEach((op) => {
            op.classList.remove(`${className}`);
        });
    }


    /**
     * Generic function to add a class to an operation list item
     *
     * @param {string} opDataName - data-name attribute of the target operation
     * @param {string} className - the class to add to the operation list item
     */
    addClassToOp(opDataName, className) {
        const ops = document.querySelectorAll(`.op-list > li.operation[data-name="${opDataName}"]`);

        // the same operation may occur twice if it is also in #catFavourites
        ops.forEach((op => {
            op.classList.add(`${className}`);
        }));
    }
}

export default OperationsWaiter;
