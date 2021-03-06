"use babel";

import { createStore, combineReducers } from "redux";

const assign = (...items) => Object.assign.apply(Object, [{}].concat(items));

function updateArrayItem(array, index, o) {
	return array.slice(0, index).concat(
		assign(array[index], o),
		array.slice(index + 1)
	);
}

function stacktrace(state = [], action) {
	switch (action.type) {
		case "RESTART":
		case "STOP":
			return [];

		case "UPDATE_STACKTRACE":
			// attempt to copy the variables over to the new stacktrace
			return action.stacktrace.map((stack) => {
				const existingStack = state.find((st) => st.addr === stack.addr);
				if (!stack.variables && existingStack) {
					stack.variables = existingStack.variables;
				}
				return stack;
			});

		case "UPDATE_VARIABLES":
			var variables = state[action.index].variables;
			if (action.path) {
				// update the variable at "path" to loaded
				variables = assign(variables, {
					[action.path]: assign(variables[action.path], { loaded: true })
				});
			}

			// TODO: update each variable in action.variables on its own? probably...
			variables = assign(variables, action.variables);
			return updateArrayItem(state, action.index, { variables: variables });
	}
	return state;
}
function goroutines(state = [], action) {
	switch (action.type) {
		case "RESTART":
		case "STOP":
			return [];

		case "UPDATE_GOROUTINES":
			return action.goroutines;
	}
	return state;
}
function breakpoints(state = [], action) {
	const { bp } = action;
	const { file, line } = bp || {};
	const index = indexOfBreakpoint(state, file, line);
	switch (action.type) {
		case "ADD_BREAKPOINT":
			if (index === -1) {
				return state.concat(bp).sort((a, b) => {
					const s =  a.file.localeCompare(b.file);
					return s !== 0 ? s : (a.line - b.line);
				});
			}
			return updateArrayItem(state, index, bp);

		case "REMOVE_BREAKPOINT":
			if (bp.state !== "busy") {
				return index === -1 ? state : state.slice(0, index).concat(state.slice(index + 1));
			}
			return updateArrayItem(state, index, bp);

		case "UPDATE_BREAKPOINT_LINE":
			if (index !== -1) {
				return updateArrayItem(state, index, { line: action.newLine });
			}
			return state;

		case "STOP":
			return state.map(({ file, line }) => {
				return { file, line, state: "notStarted" };
			});
	}

	return state;
}
function state(state = "notStarted", action) {
	switch (action.type) {
		case "STOP":
			return "notStarted";

		case "RESTART":
			return "started";

		case "SET_STATE":
			return action.state;

		case "SET_SELECTED_STACKTRACE":
			return action.state;
	}
	return state;
}
function selectedStacktrace(state = 0, action) {
	switch (action.type) {
		case "RESTART":
		case "STOP":
			return 0;

		case "SET_SELECTED_STACKTRACE":
			return action.index;

		case "UPDATE_STACKTRACE":
			return 0; // set back to the first function on each update
	}
	return state;
}
function args(state = "", action) {
	if (action.type === "UPDATE_ARGS") {
		return action.args;
	}
	return state;
}
function path(state = "", action) {
	if (action.type === "SET_DLV_PATH") {
		return action.path;
	}
	return state;
}

const gdb = combineReducers({
	stacktrace,
	goroutines,
	breakpoints,
	state,
	selectedStacktrace,
	args,
	path
});


function editors(state = {}, action) {
	void action;
	return state;
}
function panel(state, action) {
	if (!state) {
		state = { visible: atom.config.get("arm-none-eabi-gdb-debug.panelInitialVisible") };
	}
	switch (action.type) {
		case "TOGGLE_PANEL":
			return assign(state, { visible: "visible" in action ? action.visible : !state.visible });

		case "SET_PANEL_WIDTH":
			return assign(state, { width: action.width });
	}
	return state;
}
function output(state = { messages: [], visible: false }, action) {
	switch (action.type) {
		case "TOGGLE_OUTPUT":
			return assign(state, { visible: "visible" in action ? action.visible : !state.visible });

		case "CLEAN_OUTPUT":
			return assign(state, { messages: [] });

		case "ADD_OUTPUT_MESSAGE": {
			const messages = state.messages.concat({ message: action.message, type: action.messageType });
			return assign(state, { messages: messages });
		}
	}
	return state;
}
function variables(state = { expanded: {} }, action) {
	switch (action.type) {
		case "TOGGLE_VARIABLE":
			var expanded = assign(state.expanded, {
				[action.path]: "expanded" in action ? action.expanded : !state.expanded[action.path]
			});
			return assign(state, { expanded });
	}
	return state;
}

export let store;

export function init(state) {
	if (state.breakpoints) {
		state.gdb = { breakpoints: state.breakpoints };
		delete state.breakpoints;
	}

	store = createStore(combineReducers({
		editors,
		panel,
		gdb,
		output,
		variables
	}), state);
}
export function dispose() {
	store = null;
}

export function serialize() {
	const state = store.getState();
	return {
		panel: state.panel,
		gdb: {
			breakpoints: state.gdb.breakpoints.map(({ file, line }) => { return { file, line }; }),
			args: state.gdb.args
		}
	};
}

export function indexOfBreakpoint(bps, file, line) {
	return bps.findIndex((bp) => bp.file === file && bp.line === line);
}
export function getBreakpoint(file, line) {
	const bps = store.getState().gdb.breakpoints;
	const index = indexOfBreakpoint(bps, file, line);
	return index === -1 ? null : bps[index];
}
export function getBreakpoints(file) {
	const bps = store.getState().gdb.breakpoints;
	return !file ? bps : bps.filter((bp) => bp.file === file);
}
