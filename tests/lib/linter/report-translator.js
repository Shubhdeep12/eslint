/**
 * @fileoverview Tests for createReportTranslator
 * @author Teddy Katz
 */
"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const assert = require("chai").assert;
const { SourceCode } = require("../../../lib/languages/js/source-code");
const espree = require("espree");
const createReportTranslator = require("../../../lib/linter/report-translator");
const jslang = require("../../../lib/languages/js");

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

describe("createReportTranslator", () => {
	/**
	 * Creates a SourceCode instance out of JavaScript text
	 * @param {string} text Source text
	 * @returns {SourceCode} A SourceCode instance for that text
	 */
	function createSourceCode(text) {
		return new SourceCode(
			text,
			espree.parse(text.replace(/^\uFEFF/u, ""), {
				loc: true,
				range: true,
				raw: true,
				tokens: true,
				comment: true,
			}),
		);
	}

	let node, location, message, translateReport, suggestion1, suggestion2;

	beforeEach(() => {
		const sourceCode = createSourceCode("foo\nbar");

		node = sourceCode.ast.body[0];
		location = sourceCode.ast.body[1].loc.start;
		message = "foo";
		suggestion1 = "First suggestion";
		suggestion2 = "Second suggestion {{interpolated}}";
		translateReport = createReportTranslator({
			language: jslang,
			ruleId: "foo-rule",
			severity: 2,
			sourceCode,
			messageIds: {
				testMessage: message,
				suggestion1,
				suggestion2,
			},
		});
	});

	describe("old-style call with location", () => {
		it("should extract the location correctly", () => {
			assert.deepStrictEqual(
				translateReport(node, location, message, {}),
				{
					ruleId: "foo-rule",
					severity: 2,
					message: "foo",
					line: 2,
					column: 1,
					nodeType: "ExpressionStatement",
				},
			);
		});
	});

	describe("old-style call without location", () => {
		it("should use the start location and end location of the node", () => {
			assert.deepStrictEqual(translateReport(node, message, {}), {
				ruleId: "foo-rule",
				severity: 2,
				message: "foo",
				line: 1,
				column: 1,
				endLine: 1,
				endColumn: 4,
				nodeType: "ExpressionStatement",
			});
		});
	});

	describe("new-style call with all options", () => {
		it("should include the new-style options in the report", () => {
			const reportDescriptor = {
				node,
				loc: location,
				message,
				fix: () => ({ range: [1, 2], text: "foo" }),
				suggest: [
					{
						desc: "suggestion 1",
						fix: () => ({ range: [2, 3], text: "s1" }),
					},
					{
						desc: "suggestion 2",
						fix: () => ({ range: [3, 4], text: "s2" }),
					},
				],
			};

			assert.deepStrictEqual(translateReport(reportDescriptor), {
				ruleId: "foo-rule",
				severity: 2,
				message: "foo",
				line: 2,
				column: 1,
				nodeType: "ExpressionStatement",
				fix: {
					range: [1, 2],
					text: "foo",
				},
				suggestions: [
					{
						desc: "suggestion 1",
						fix: { range: [2, 3], text: "s1" },
					},
					{
						desc: "suggestion 2",
						fix: { range: [3, 4], text: "s2" },
					},
				],
			});
		});

		it("should translate the messageId into a message", () => {
			const reportDescriptor = {
				node,
				loc: location,
				messageId: "testMessage",
				fix: () => ({ range: [1, 2], text: "foo" }),
			};

			assert.deepStrictEqual(translateReport(reportDescriptor), {
				ruleId: "foo-rule",
				severity: 2,
				message: "foo",
				messageId: "testMessage",
				line: 2,
				column: 1,
				nodeType: "ExpressionStatement",
				fix: {
					range: [1, 2],
					text: "foo",
				},
			});
		});

		it("should throw when both messageId and message are provided", () => {
			const reportDescriptor = {
				node,
				loc: location,
				messageId: "testMessage",
				message: "bar",
				fix: () => ({ range: [1, 2], text: "foo" }),
			};

			assert.throws(
				() => translateReport(reportDescriptor),
				TypeError,
				"context.report() called with a message and a messageId. Please only pass one.",
			);
		});

		it("should throw when an invalid messageId is provided", () => {
			const reportDescriptor = {
				node,
				loc: location,
				messageId: "thisIsNotASpecifiedMessageId",
				fix: () => ({ range: [1, 2], text: "foo" }),
			};

			assert.throws(
				() => translateReport(reportDescriptor),
				TypeError,
				/^context\.report\(\) called with a messageId of '[^']+' which is not present in the 'messages' config:/u,
			);
		});

		it("should throw when no message is provided", () => {
			const reportDescriptor = { node };

			assert.throws(
				() => translateReport(reportDescriptor),
				TypeError,
				"Missing `message` property in report() call; add a message that describes the linting problem.",
			);
		});

		it("should support messageIds for suggestions and output resulting descriptions", () => {
			const reportDescriptor = {
				node,
				loc: location,
				message,
				suggest: [
					{
						messageId: "suggestion1",
						fix: () => ({ range: [2, 3], text: "s1" }),
					},
					{
						messageId: "suggestion2",
						data: { interpolated: "'interpolated value'" },
						fix: () => ({ range: [3, 4], text: "s2" }),
					},
				],
			};

			assert.deepStrictEqual(translateReport(reportDescriptor), {
				ruleId: "foo-rule",
				severity: 2,
				message: "foo",
				line: 2,
				column: 1,
				nodeType: "ExpressionStatement",
				suggestions: [
					{
						messageId: "suggestion1",
						desc: "First suggestion",
						fix: { range: [2, 3], text: "s1" },
					},
					{
						messageId: "suggestion2",
						data: { interpolated: "'interpolated value'" },
						desc: "Second suggestion 'interpolated value'",
						fix: { range: [3, 4], text: "s2" },
					},
				],
			});
		});

		it("should throw when a suggestion defines both a desc and messageId", () => {
			const reportDescriptor = {
				node,
				loc: location,
				message,
				suggest: [
					{
						desc: "The description",
						messageId: "suggestion1",
						fix: () => ({ range: [2, 3], text: "s1" }),
					},
				],
			};

			assert.throws(
				() => translateReport(reportDescriptor),
				TypeError,
				"context.report() called with a suggest option that defines both a 'messageId' and an 'desc'. Please only pass one.",
			);
		});

		it("should throw when a suggestion uses an invalid messageId", () => {
			const reportDescriptor = {
				node,
				loc: location,
				message,
				suggest: [
					{
						messageId: "noMatchingMessage",
						fix: () => ({ range: [2, 3], text: "s1" }),
					},
				],
			};

			assert.throws(
				() => translateReport(reportDescriptor),
				TypeError,
				/^context\.report\(\) called with a suggest option with a messageId '[^']+' which is not present in the 'messages' config:/u,
			);
		});

		it("should throw when a suggestion does not provide either a desc or messageId", () => {
			const reportDescriptor = {
				node,
				loc: location,
				message,
				suggest: [
					{
						fix: () => ({ range: [2, 3], text: "s1" }),
					},
				],
			};

			assert.throws(
				() => translateReport(reportDescriptor),
				TypeError,
				"context.report() called with a suggest option that doesn't have either a `desc` or `messageId`",
			);
		});

		it("should throw when a suggestion does not provide a fix function", () => {
			const reportDescriptor = {
				node,
				loc: location,
				message,
				suggest: [
					{
						desc: "The description",
						fix: false,
					},
				],
			};

			assert.throws(
				() => translateReport(reportDescriptor),
				TypeError,
				/^context\.report\(\) called with a suggest option without a fix function. See:/u,
			);
		});
	});

	describe("combining autofixes", () => {
		it("should merge fixes to one if 'fix' function returns an array of fixes.", () => {
			const reportDescriptor = {
				node,
				loc: location,
				message,
				fix: () => [
					{ range: [1, 2], text: "foo" },
					{ range: [4, 5], text: "bar" },
				],
			};

			assert.deepStrictEqual(translateReport(reportDescriptor), {
				ruleId: "foo-rule",
				severity: 2,
				message: "foo",
				line: 2,
				column: 1,
				nodeType: "ExpressionStatement",
				fix: {
					range: [1, 5],
					text: "fooo\nbar",
				},
			});
		});

		it("should merge fixes to one if 'fix' function returns an iterator of fixes.", () => {
			const reportDescriptor = {
				node,
				loc: location,
				message,
				*fix() {
					yield { range: [1, 2], text: "foo" };
					yield { range: [4, 5], text: "bar" };
				},
			};

			assert.deepStrictEqual(translateReport(reportDescriptor), {
				ruleId: "foo-rule",
				severity: 2,
				message: "foo",
				line: 2,
				column: 1,
				nodeType: "ExpressionStatement",
				fix: {
					range: [1, 5],
					text: "fooo\nbar",
				},
			});
		});

		it("should respect ranges of empty insertions when merging fixes to one.", () => {
			const reportDescriptor = {
				node,
				loc: location,
				message,
				*fix() {
					yield { range: [4, 5], text: "cd" };
					yield { range: [2, 2], text: "" };
					yield { range: [7, 7], text: "" };
				},
			};

			assert.deepStrictEqual(translateReport(reportDescriptor), {
				ruleId: "foo-rule",
				severity: 2,
				message: "foo",
				line: 2,
				column: 1,
				nodeType: "ExpressionStatement",
				fix: {
					range: [2, 7],
					text: "o\ncdar",
				},
			});
		});

		it("should pass through fixes if only one is present", () => {
			const reportDescriptor = {
				node,
				loc: location,
				message,
				fix: () => [{ range: [1, 2], text: "foo" }],
			};

			assert.deepStrictEqual(translateReport(reportDescriptor), {
				ruleId: "foo-rule",
				severity: 2,
				message: "foo",
				line: 2,
				column: 1,
				nodeType: "ExpressionStatement",
				fix: {
					range: [1, 2],
					text: "foo",
				},
			});
		});

		it("should handle inserting BOM correctly.", () => {
			const reportDescriptor = {
				node,
				loc: location,
				message,
				fix: () => [
					{ range: [0, 3], text: "\uFEFFfoo" },
					{ range: [4, 5], text: "x" },
				],
			};

			assert.deepStrictEqual(translateReport(reportDescriptor), {
				ruleId: "foo-rule",
				severity: 2,
				message: "foo",
				line: 2,
				column: 1,
				nodeType: "ExpressionStatement",
				fix: {
					range: [0, 5],
					text: "\uFEFFfoo\nx",
				},
			});
		});

		it("should handle removing BOM correctly.", () => {
			const sourceCode = createSourceCode("\uFEFFfoo\nbar");

			node = sourceCode.ast.body[0];

			const reportDescriptor = {
				node,
				message,
				fix: () => [
					{ range: [-1, 3], text: "foo" },
					{ range: [4, 5], text: "x" },
				],
			};

			assert.deepStrictEqual(
				createReportTranslator({
					language: jslang,
					ruleId: "foo-rule",
					severity: 1,
					sourceCode,
				})(reportDescriptor),
				{
					ruleId: "foo-rule",
					severity: 1,
					message: "foo",
					line: 1,
					column: 1,
					endLine: 1,
					endColumn: 4,
					nodeType: "ExpressionStatement",
					fix: {
						range: [-1, 5],
						text: "foo\nx",
					},
				},
			);
		});

		it("should throw an assertion error if ranges are overlapped.", () => {
			const reportDescriptor = {
				node,
				loc: location,
				message,
				fix: () => [
					{ range: [0, 3], text: "\uFEFFfoo" },
					{ range: [2, 5], text: "x" },
				],
			};

			assert.throws(
				translateReport.bind(null, reportDescriptor),
				"Fix objects must not be overlapped in a report.",
			);
		});

		it("should include a fix passed as the last argument when location is passed", () => {
			assert.deepStrictEqual(
				translateReport(
					node,
					{ line: 42, column: 23 },
					"my message {{1}}{{0}}",
					["!", "testing"],
					() => ({ range: [1, 1], text: "" }),
				),
				{
					ruleId: "foo-rule",
					severity: 2,
					message: "my message testing!",
					line: 42,
					column: 24,
					nodeType: "ExpressionStatement",
					fix: {
						range: [1, 1],
						text: "",
					},
				},
			);
		});
	});

	describe("suggestions", () => {
		it("should support multiple suggestions.", () => {
			const reportDescriptor = {
				node,
				loc: location,
				message,
				suggest: [
					{
						desc: "A first suggestion for the issue",
						fix: () => [{ range: [1, 2], text: "foo" }],
					},
					{
						desc: "A different suggestion for the issue",
						fix: () => [{ range: [1, 3], text: "foobar" }],
					},
				],
			};

			assert.deepStrictEqual(translateReport(reportDescriptor), {
				ruleId: "foo-rule",
				severity: 2,
				message: "foo",
				line: 2,
				column: 1,
				nodeType: "ExpressionStatement",
				suggestions: [
					{
						desc: "A first suggestion for the issue",
						fix: { range: [1, 2], text: "foo" },
					},
					{
						desc: "A different suggestion for the issue",
						fix: { range: [1, 3], text: "foobar" },
					},
				],
			});
		});

		it("should merge suggestion fixes to one if 'fix' function returns an array of fixes.", () => {
			const reportDescriptor = {
				node,
				loc: location,
				message,
				suggest: [
					{
						desc: "A suggestion for the issue",
						fix: () => [
							{ range: [1, 2], text: "foo" },
							{ range: [4, 5], text: "bar" },
						],
					},
				],
			};

			assert.deepStrictEqual(translateReport(reportDescriptor), {
				ruleId: "foo-rule",
				severity: 2,
				message: "foo",
				line: 2,
				column: 1,
				nodeType: "ExpressionStatement",
				suggestions: [
					{
						desc: "A suggestion for the issue",
						fix: {
							range: [1, 5],
							text: "fooo\nbar",
						},
					},
				],
			});
		});

		it("should remove the whole suggestion if 'fix' function returned `null`.", () => {
			const reportDescriptor = {
				node,
				loc: location,
				message,
				suggest: [
					{
						desc: "A suggestion for the issue",
						fix: () => null,
					},
				],
			};

			assert.deepStrictEqual(translateReport(reportDescriptor), {
				ruleId: "foo-rule",
				severity: 2,
				message: "foo",
				line: 2,
				column: 1,
				nodeType: "ExpressionStatement",
			});
		});

		it("should remove the whole suggestion if 'fix' function returned an empty array.", () => {
			const reportDescriptor = {
				node,
				loc: location,
				message,
				suggest: [
					{
						desc: "A suggestion for the issue",
						fix: () => [],
					},
				],
			};

			assert.deepStrictEqual(translateReport(reportDescriptor), {
				ruleId: "foo-rule",
				severity: 2,
				message: "foo",
				line: 2,
				column: 1,
				nodeType: "ExpressionStatement",
			});
		});

		it("should remove the whole suggestion if 'fix' function returned an empty sequence.", () => {
			const reportDescriptor = {
				node,
				loc: location,
				message,
				suggest: [
					{
						desc: "A suggestion for the issue",
						*fix() {},
					},
				],
			};

			assert.deepStrictEqual(translateReport(reportDescriptor), {
				ruleId: "foo-rule",
				severity: 2,
				message: "foo",
				line: 2,
				column: 1,
				nodeType: "ExpressionStatement",
			});
		});

		// This isn't officially supported, but autofix works the same way
		it("should remove the whole suggestion if 'fix' function didn't return anything.", () => {
			const reportDescriptor = {
				node,
				loc: location,
				message,
				suggest: [
					{
						desc: "A suggestion for the issue",
						fix() {},
					},
				],
			};

			assert.deepStrictEqual(translateReport(reportDescriptor), {
				ruleId: "foo-rule",
				severity: 2,
				message: "foo",
				line: 2,
				column: 1,
				nodeType: "ExpressionStatement",
			});
		});

		it("should keep suggestion before a removed suggestion.", () => {
			const reportDescriptor = {
				node,
				loc: location,
				message,
				suggest: [
					{
						desc: "Suggestion with a fix",
						fix: () => ({ range: [1, 2], text: "foo" }),
					},
					{
						desc: "Suggestion without a fix",
						fix: () => null,
					},
				],
			};

			assert.deepStrictEqual(translateReport(reportDescriptor), {
				ruleId: "foo-rule",
				severity: 2,
				message: "foo",
				line: 2,
				column: 1,
				nodeType: "ExpressionStatement",
				suggestions: [
					{
						desc: "Suggestion with a fix",
						fix: { range: [1, 2], text: "foo" },
					},
				],
			});
		});

		it("should keep suggestion after a removed suggestion.", () => {
			const reportDescriptor = {
				node,
				loc: location,
				message,
				suggest: [
					{
						desc: "Suggestion without a fix",
						fix: () => null,
					},
					{
						desc: "Suggestion with a fix",
						fix: () => ({ range: [1, 2], text: "foo" }),
					},
				],
			};

			assert.deepStrictEqual(translateReport(reportDescriptor), {
				ruleId: "foo-rule",
				severity: 2,
				message: "foo",
				line: 2,
				column: 1,
				nodeType: "ExpressionStatement",
				suggestions: [
					{
						desc: "Suggestion with a fix",
						fix: { range: [1, 2], text: "foo" },
					},
				],
			});
		});

		it("should remove multiple suggestions that didn't provide a fix and keep those that did.", () => {
			const reportDescriptor = {
				node,
				loc: location,
				message,
				suggest: [
					{
						desc: "Keep #1",
						fix: () => ({ range: [1, 2], text: "foo" }),
					},
					{
						desc: "Remove #1",
						fix() {
							return null;
						},
					},
					{
						desc: "Keep #2",
						fix: () => ({ range: [1, 2], text: "bar" }),
					},
					{
						desc: "Remove #2",
						fix() {
							return [];
						},
					},
					{
						desc: "Keep #3",
						fix: () => ({ range: [1, 2], text: "baz" }),
					},
					{
						desc: "Remove #3",
						*fix() {},
					},
					{
						desc: "Keep #4",
						fix: () => ({ range: [1, 2], text: "quux" }),
					},
				],
			};

			assert.deepStrictEqual(translateReport(reportDescriptor), {
				ruleId: "foo-rule",
				severity: 2,
				message: "foo",
				line: 2,
				column: 1,
				nodeType: "ExpressionStatement",
				suggestions: [
					{
						desc: "Keep #1",
						fix: { range: [1, 2], text: "foo" },
					},
					{
						desc: "Keep #2",
						fix: { range: [1, 2], text: "bar" },
					},
					{
						desc: "Keep #3",
						fix: { range: [1, 2], text: "baz" },
					},
					{
						desc: "Keep #4",
						fix: { range: [1, 2], text: "quux" },
					},
				],
			});
		});
	});

	describe("message interpolation", () => {
		it("should correctly parse a message when being passed all options in an old-style report", () => {
			assert.deepStrictEqual(
				translateReport(node, node.loc.end, "hello {{dynamic}}", {
					dynamic: node.type,
				}),
				{
					severity: 2,
					ruleId: "foo-rule",
					message: "hello ExpressionStatement",
					nodeType: "ExpressionStatement",
					line: 1,
					column: 4,
				},
			);
		});

		it("should correctly parse a message when being passed all options in a new-style report", () => {
			assert.deepStrictEqual(
				translateReport({
					node,
					loc: node.loc.end,
					message: "hello {{dynamic}}",
					data: { dynamic: node.type },
				}),
				{
					severity: 2,
					ruleId: "foo-rule",
					message: "hello ExpressionStatement",
					nodeType: "ExpressionStatement",
					line: 1,
					column: 4,
				},
			);
		});

		it("should correctly parse a message with object keys as numbers", () => {
			assert.strictEqual(
				translateReport(node, "my message {{name}}{{0}}", {
					0: "!",
					name: "testing",
				}).message,
				"my message testing!",
			);
		});

		it("should correctly parse a message with array", () => {
			assert.strictEqual(
				translateReport(node, "my message {{1}}{{0}}", ["!", "testing"])
					.message,
				"my message testing!",
			);
		});

		it("should allow template parameter with inner whitespace", () => {
			assert.strictEqual(
				translateReport(node, "message {{parameter name}}", {
					"parameter name": "yay!",
				}).message,
				"message yay!",
			);
		});

		it("should allow template parameter with non-identifier characters", () => {
			assert.strictEqual(
				translateReport(node, "message {{parameter-name}}", {
					"parameter-name": "yay!",
				}).message,
				"message yay!",
			);
		});

		it("should allow template parameter wrapped in braces", () => {
			assert.strictEqual(
				translateReport(node, "message {{{param}}}", { param: "yay!" })
					.message,
				"message {yay!}",
			);
		});

		it("should ignore template parameter with no specified value", () => {
			assert.strictEqual(
				translateReport(node, "message {{parameter}}", {}).message,
				"message {{parameter}}",
			);
		});

		it("should handle leading whitespace in template parameter", () => {
			assert.strictEqual(
				translateReport({
					node,
					message: "message {{ parameter}}",
					data: { parameter: "yay!" },
				}).message,
				"message yay!",
			);
		});

		it("should handle trailing whitespace in template parameter", () => {
			assert.strictEqual(
				translateReport({
					node,
					message: "message {{parameter }}",
					data: { parameter: "yay!" },
				}).message,
				"message yay!",
			);
		});

		it("should still allow inner whitespace as well as leading/trailing", () => {
			assert.strictEqual(
				translateReport(node, "message {{ parameter name }}", {
					"parameter name": "yay!",
				}).message,
				"message yay!",
			);
		});

		it("should still allow non-identifier characters as well as leading/trailing whitespace", () => {
			assert.strictEqual(
				translateReport(node, "message {{ parameter-name }}", {
					"parameter-name": "yay!",
				}).message,
				"message yay!",
			);
		});
	});

	describe("location inference", () => {
		it("should use the provided location when given in an old-style call", () => {
			assert.deepStrictEqual(
				translateReport(node, { line: 42, column: 13 }, "hello world"),
				{
					severity: 2,
					ruleId: "foo-rule",
					message: "hello world",
					nodeType: "ExpressionStatement",
					line: 42,
					column: 14,
				},
			);
		});

		it("should use the provided location when given in an new-style call", () => {
			assert.deepStrictEqual(
				translateReport({
					node,
					loc: { line: 42, column: 13 },
					message: "hello world",
				}),
				{
					severity: 2,
					ruleId: "foo-rule",
					message: "hello world",
					nodeType: "ExpressionStatement",
					line: 42,
					column: 14,
				},
			);
		});

		it("should extract the start and end locations from a node if no location is provided", () => {
			assert.deepStrictEqual(translateReport(node, "hello world"), {
				severity: 2,
				ruleId: "foo-rule",
				message: "hello world",
				nodeType: "ExpressionStatement",
				line: 1,
				column: 1,
				endLine: 1,
				endColumn: 4,
			});
		});

		it("should have 'endLine' and 'endColumn' when 'loc' property has 'end' property.", () => {
			assert.deepStrictEqual(
				translateReport({ loc: node.loc, message: "hello world" }),
				{
					severity: 2,
					ruleId: "foo-rule",
					message: "hello world",
					nodeType: null,
					line: 1,
					column: 1,
					endLine: 1,
					endColumn: 4,
				},
			);
		});

		it("should not have 'endLine' and 'endColumn' when 'loc' property does not have 'end' property.", () => {
			assert.deepStrictEqual(
				translateReport({
					loc: node.loc.start,
					message: "hello world",
				}),
				{
					severity: 2,
					ruleId: "foo-rule",
					message: "hello world",
					nodeType: null,
					line: 1,
					column: 1,
				},
			);
		});

		it("should infer an 'endLine' and 'endColumn' property when using the object-based context.report API", () => {
			assert.deepStrictEqual(
				translateReport({ node, message: "hello world" }),
				{
					severity: 2,
					ruleId: "foo-rule",
					message: "hello world",
					nodeType: "ExpressionStatement",
					line: 1,
					column: 1,
					endLine: 1,
					endColumn: 4,
				},
			);
		});
	});

	describe("converting old-style calls", () => {
		it("should include a fix passed as the last argument when location is not passed", () => {
			assert.deepStrictEqual(
				translateReport(
					node,
					"my message {{1}}{{0}}",
					["!", "testing"],
					() => ({ range: [1, 1], text: "" }),
				),
				{
					severity: 2,
					ruleId: "foo-rule",
					message: "my message testing!",
					nodeType: "ExpressionStatement",
					line: 1,
					column: 1,
					endLine: 1,
					endColumn: 4,
					fix: { range: [1, 1], text: "" },
				},
			);
		});
	});

	describe("validation", () => {
		it("should throw an error if node is not an object", () => {
			assert.throws(
				() => translateReport("not a node", "hello world"),
				"Node must be an object",
			);
		});

		it("should not throw an error if location is provided and node is not in an old-style call", () => {
			assert.deepStrictEqual(
				translateReport(null, { line: 1, column: 1 }, "hello world"),
				{
					severity: 2,
					ruleId: "foo-rule",
					message: "hello world",
					nodeType: null,
					line: 1,
					column: 2,
				},
			);
		});

		it("should not throw an error if location is provided and node is not in a new-style call", () => {
			assert.deepStrictEqual(
				translateReport({
					loc: { line: 1, column: 1 },
					message: "hello world",
				}),
				{
					severity: 2,
					ruleId: "foo-rule",
					message: "hello world",
					nodeType: null,
					line: 1,
					column: 2,
				},
			);
		});

		it("should throw an error if neither node nor location is provided", () => {
			assert.throws(
				() => translateReport(null, "hello world"),
				"Node must be provided when reporting error if location is not provided",
			);
		});

		it("should throw an error if fix range is invalid", () => {
			assert.throws(
				() =>
					translateReport({
						node,
						messageId: "testMessage",
						fix: () => ({ text: "foo" }),
					}),
				"Fix has invalid range",
			);

			for (const badRange of [
				[0],
				[0, null],
				[null, 0],
				[void 0, 1],
				[0, void 0],
				[void 0, void 0],
				[],
			]) {
				assert.throws(
					// eslint-disable-next-line no-loop-func -- Using arrow functions
					() =>
						translateReport({
							node,
							messageId: "testMessage",
							fix: () => ({ range: badRange, text: "foo" }),
						}),
					"Fix has invalid range",
				);

				assert.throws(
					// eslint-disable-next-line no-loop-func -- Using arrow functions
					() =>
						translateReport({
							node,
							messageId: "testMessage",
							fix: () => [
								{ range: [0, 0], text: "foo" },
								{ range: badRange, text: "bar" },
								{ range: [1, 1], text: "baz" },
							],
						}),
					"Fix has invalid range",
				);
			}
		});
	});

	// https://github.com/eslint/eslint/issues/16716
	describe("unique `fix` and `fix.range` objects", () => {
		const range = [0, 3];
		const fix = { range, text: "baz" };
		const additionalRange = [4, 7];
		const additionalFix = { range: additionalRange, text: "qux" };

		it("should deep clone returned fix object", () => {
			const translatedReport = translateReport({
				node,
				messageId: "testMessage",
				fix: () => fix,
			});

			assert.deepStrictEqual(translatedReport.fix, fix);
			assert.notStrictEqual(translatedReport.fix, fix);
			assert.notStrictEqual(translatedReport.fix.range, fix.range);
		});

		it("should create a new fix object with a new range array when `fix()` returns an array with a single item", () => {
			const translatedReport = translateReport({
				node,
				messageId: "testMessage",
				fix: () => [fix],
			});

			assert.deepStrictEqual(translatedReport.fix, fix);
			assert.notStrictEqual(translatedReport.fix, fix);
			assert.notStrictEqual(translatedReport.fix.range, fix.range);
		});

		it("should create a new fix object with a new range array when `fix()` returns an array with multiple items", () => {
			const translatedReport = translateReport({
				node,
				messageId: "testMessage",
				fix: () => [fix, additionalFix],
			});

			assert.notStrictEqual(translatedReport.fix, fix);
			assert.notStrictEqual(translatedReport.fix.range, fix.range);
			assert.notStrictEqual(translatedReport.fix, additionalFix);
			assert.notStrictEqual(
				translatedReport.fix.range,
				additionalFix.range,
			);
		});

		it("should create a new fix object with a new range array when `fix()` generator yields a single item", () => {
			const translatedReport = translateReport({
				node,
				messageId: "testMessage",
				*fix() {
					yield fix;
				},
			});

			assert.deepStrictEqual(translatedReport.fix, fix);
			assert.notStrictEqual(translatedReport.fix, fix);
			assert.notStrictEqual(translatedReport.fix.range, fix.range);
		});

		it("should create a new fix object with a new range array when `fix()` generator yields multiple items", () => {
			const translatedReport = translateReport({
				node,
				messageId: "testMessage",
				*fix() {
					yield fix;
					yield additionalFix;
				},
			});

			assert.notStrictEqual(translatedReport.fix, fix);
			assert.notStrictEqual(translatedReport.fix.range, fix.range);
			assert.notStrictEqual(translatedReport.fix, additionalFix);
			assert.notStrictEqual(
				translatedReport.fix.range,
				additionalFix.range,
			);
		});

		it("should deep clone returned suggestion fix object", () => {
			const translatedReport = translateReport({
				node,
				messageId: "testMessage",
				suggest: [
					{
						messageId: "suggestion1",
						fix: () => fix,
					},
				],
			});

			assert.deepStrictEqual(translatedReport.suggestions[0].fix, fix);
			assert.notStrictEqual(translatedReport.suggestions[0].fix, fix);
			assert.notStrictEqual(
				translatedReport.suggestions[0].fix.range,
				fix.range,
			);
		});

		it("should create a new fix object with a new range array when suggestion `fix()` returns an array with a single item", () => {
			const translatedReport = translateReport({
				node,
				messageId: "testMessage",
				suggest: [
					{
						messageId: "suggestion1",
						fix: () => [fix],
					},
				],
			});

			assert.deepStrictEqual(translatedReport.suggestions[0].fix, fix);
			assert.notStrictEqual(translatedReport.suggestions[0].fix, fix);
			assert.notStrictEqual(
				translatedReport.suggestions[0].fix.range,
				fix.range,
			);
		});

		it("should create a new fix object with a new range array when suggestion `fix()` returns an array with multiple items", () => {
			const translatedReport = translateReport({
				node,
				messageId: "testMessage",
				suggest: [
					{
						messageId: "suggestion1",
						fix: () => [fix, additionalFix],
					},
				],
			});

			assert.notStrictEqual(translatedReport.suggestions[0].fix, fix);
			assert.notStrictEqual(
				translatedReport.suggestions[0].fix.range,
				fix.range,
			);
			assert.notStrictEqual(
				translatedReport.suggestions[0].fix,
				additionalFix,
			);
			assert.notStrictEqual(
				translatedReport.suggestions[0].fix.range,
				additionalFix.range,
			);
		});

		it("should create a new fix object with a new range array when suggestion `fix()` generator yields a single item", () => {
			const translatedReport = translateReport({
				node,
				messageId: "testMessage",
				suggest: [
					{
						messageId: "suggestion1",
						*fix() {
							yield fix;
						},
					},
				],
			});

			assert.deepStrictEqual(translatedReport.suggestions[0].fix, fix);
			assert.notStrictEqual(translatedReport.suggestions[0].fix, fix);
			assert.notStrictEqual(
				translatedReport.suggestions[0].fix.range,
				fix.range,
			);
		});

		it("should create a new fix object with a new range array when suggestion `fix()` generator yields multiple items", () => {
			const translatedReport = translateReport({
				node,
				messageId: "testMessage",
				suggest: [
					{
						messageId: "suggestion1",
						*fix() {
							yield fix;
							yield additionalFix;
						},
					},
				],
			});

			assert.notStrictEqual(translatedReport.suggestions[0].fix, fix);
			assert.notStrictEqual(
				translatedReport.suggestions[0].fix.range,
				fix.range,
			);
			assert.notStrictEqual(
				translatedReport.suggestions[0].fix,
				additionalFix,
			);
			assert.notStrictEqual(
				translatedReport.suggestions[0].fix.range,
				additionalFix.range,
			);
		});

		it("should create different instances of range arrays when suggestions reuse the same instance", () => {
			const translatedReport = translateReport({
				node,
				messageId: "testMessage",
				suggest: [
					{
						messageId: "suggestion1",
						fix: () => ({ range, text: "baz" }),
					},
					{
						messageId: "suggestion2",
						data: { interpolated: "'interpolated value'" },
						fix: () => ({ range, text: "qux" }),
					},
				],
			});

			assert.deepStrictEqual(
				translatedReport.suggestions[0].fix.range,
				range,
			);
			assert.deepStrictEqual(
				translatedReport.suggestions[1].fix.range,
				range,
			);
			assert.notStrictEqual(
				translatedReport.suggestions[0].fix.range,
				translatedReport.suggestions[1].fix.range,
			);
		});
	});
});
