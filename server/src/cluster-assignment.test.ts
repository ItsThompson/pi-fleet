import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
	assignSessionToCluster,
	expandTilde,
	normalizeTrailingSlash,
} from "./cluster-assignment.js";
import type { ClusterConfig } from "@pi-fleet/shared";
import { homedir } from "node:os";

describe("expandTilde", () => {
	it("expands ~ at the start of a path", () => {
		const result = expandTilde("~/projects");
		expect(result).toBe(`${homedir()}/projects`);
	});

	it("expands lone ~", () => {
		const result = expandTilde("~");
		expect(result).toBe(homedir());
	});

	it("does not expand ~ in the middle of a path", () => {
		const result = expandTilde("/home/user/~/test");
		expect(result).toBe("/home/user/~/test");
	});

	it("leaves absolute paths unchanged", () => {
		const result = expandTilde("/Users/test/projects");
		expect(result).toBe("/Users/test/projects");
	});
});

describe("normalizeTrailingSlash", () => {
	it("adds trailing slash when missing", () => {
		expect(normalizeTrailingSlash("/home/user")).toBe("/home/user/");
	});

	it("preserves existing trailing slash", () => {
		expect(normalizeTrailingSlash("/home/user/")).toBe("/home/user/");
	});
});

describe("assignSessionToCluster", () => {
	const baseConfig: ClusterConfig = {
		version: 1,
		clusters: [
			{
				id: "cluster-work",
				name: "Work",
				directories: ["~/workplace/"],
				sortOrder: 0,
			},
			{
				id: "cluster-personal",
				name: "Personal",
				directories: ["~/personal/", "~/Documents/pi-fleet/"],
				sortOrder: 1,
			},
		],
		manualAssignments: {},
	};

	it("returns manual override when manual assignment exists", () => {
		const config: ClusterConfig = {
			...baseConfig,
			manualAssignments: { "session-1": "cluster-work" },
		};

		const result = assignSessionToCluster(
			"session-1",
			"/some/random/path",
			config,
		);

		expect(result).toEqual({ clusterId: "cluster-work", reason: "manual" });
	});

	it("manual override takes precedence over directory match", () => {
		const config: ClusterConfig = {
			...baseConfig,
			manualAssignments: { "session-1": "cluster-personal" },
		};

		// cwd matches "Work" by directory, but manual overrides to "Personal"
		const result = assignSessionToCluster(
			"session-1",
			`${homedir()}/workplace/project-a`,
			config,
		);

		expect(result).toEqual({
			clusterId: "cluster-personal",
			reason: "manual",
		});
	});

	it("ignores manual assignment to deleted cluster", () => {
		const config: ClusterConfig = {
			...baseConfig,
			manualAssignments: { "session-1": "deleted-cluster-id" },
		};

		const result = assignSessionToCluster(
			"session-1",
			`${homedir()}/workplace/project-a`,
			config,
		);

		// Falls through to directory match
		expect(result).toEqual({ clusterId: "cluster-work", reason: "directory" });
	});

	it("matches directory by prefix", () => {
		const result = assignSessionToCluster(
			"session-1",
			`${homedir()}/workplace/project-a`,
			baseConfig,
		);

		expect(result).toEqual({ clusterId: "cluster-work", reason: "directory" });
	});

	it("longest prefix wins when multiple clusters match", () => {
		const config: ClusterConfig = {
			version: 1,
			clusters: [
				{
					id: "cluster-broad",
					name: "Broad",
					directories: ["~/workspace/"],
					sortOrder: 0,
				},
				{
					id: "cluster-specific",
					name: "Specific",
					directories: ["~/workspace/team-a/"],
					sortOrder: 1,
				},
			],
			manualAssignments: {},
		};

		const result = assignSessionToCluster(
			"session-1",
			`${homedir()}/workspace/team-a/project`,
			config,
		);

		expect(result).toEqual({
			clusterId: "cluster-specific",
			reason: "directory",
		});
	});

	it("handles tilde expansion in cluster directories", () => {
		const config: ClusterConfig = {
			version: 1,
			clusters: [
				{
					id: "cluster-tilde",
					name: "Tilde",
					directories: ["~/myprojects"],
					sortOrder: 0,
				},
			],
			manualAssignments: {},
		};

		const result = assignSessionToCluster(
			"session-1",
			`${homedir()}/myprojects/foo`,
			config,
		);

		expect(result).toEqual({
			clusterId: "cluster-tilde",
			reason: "directory",
		});
	});

	it("normalizes trailing slash before comparison", () => {
		const config: ClusterConfig = {
			version: 1,
			clusters: [
				{
					id: "cluster-noslash",
					name: "No Slash",
					directories: ["~/projects"], // no trailing slash
					sortOrder: 0,
				},
			],
			manualAssignments: {},
		};

		const result = assignSessionToCluster(
			"session-1",
			`${homedir()}/projects/deep/path`,
			config,
		);

		expect(result).toEqual({
			clusterId: "cluster-noslash",
			reason: "directory",
		});
	});

	it("trailing slash prevents partial directory name matches", () => {
		const config: ClusterConfig = {
			version: 1,
			clusters: [
				{
					id: "cluster-foo",
					name: "Foo",
					directories: ["~/foo"],
					sortOrder: 0,
				},
			],
			manualAssignments: {},
		};

		// "~/foobar/baz" should NOT match "~/foo" because after trailing slash
		// normalization: "~/foo/" does not match "~/foobar/baz/"
		const result = assignSessionToCluster(
			"session-1",
			`${homedir()}/foobar/baz`,
			config,
		);

		expect(result).toEqual({ clusterId: null, reason: "none" });
	});

	it("returns unclustered when no match", () => {
		const result = assignSessionToCluster(
			"session-1",
			"/some/random/unmatched/path",
			baseConfig,
		);

		expect(result).toEqual({ clusterId: null, reason: "none" });
	});

	it("handles empty cluster directories array", () => {
		const config: ClusterConfig = {
			version: 1,
			clusters: [
				{
					id: "cluster-empty",
					name: "Empty",
					directories: [],
					sortOrder: 0,
				},
			],
			manualAssignments: {},
		};

		const result = assignSessionToCluster(
			"session-1",
			`${homedir()}/something`,
			config,
		);

		expect(result).toEqual({ clusterId: null, reason: "none" });
	});

	it("handles empty clusters array", () => {
		const config: ClusterConfig = {
			version: 1,
			clusters: [],
			manualAssignments: {},
		};

		const result = assignSessionToCluster("session-1", "/some/path", config);

		expect(result).toEqual({ clusterId: null, reason: "none" });
	});
});
