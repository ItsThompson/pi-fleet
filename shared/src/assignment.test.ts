import { describe, it, expect } from "vitest";
import {
	assignSessionToCluster,
	expandTilde,
	normalizeTrailingSlash,
	inferHomedir,
} from "./assignment.js";
import type { ClusterConfig } from "./types/cluster.js";

const TEST_HOMEDIR = "/Users/testuser";

describe("expandTilde", () => {
	it("expands ~ at the start of a path", () => {
		const result = expandTilde("~/projects", TEST_HOMEDIR);
		expect(result).toBe("/Users/testuser/projects");
	});

	it("expands lone ~", () => {
		const result = expandTilde("~", TEST_HOMEDIR);
		expect(result).toBe("/Users/testuser");
	});

	it("does not expand ~ in the middle of a path", () => {
		const result = expandTilde("/home/user/~/test", TEST_HOMEDIR);
		expect(result).toBe("/home/user/~/test");
	});

	it("leaves absolute paths unchanged", () => {
		const result = expandTilde("/Users/other/projects", TEST_HOMEDIR);
		expect(result).toBe("/Users/other/projects");
	});

	it("handles empty homedir gracefully", () => {
		const result = expandTilde("~/projects", "");
		expect(result).toBe("/projects");
	});
});

describe("normalizeTrailingSlash", () => {
	it("adds trailing slash when missing", () => {
		expect(normalizeTrailingSlash("/home/user")).toBe("/home/user/");
	});

	it("preserves existing trailing slash", () => {
		expect(normalizeTrailingSlash("/home/user/")).toBe("/home/user/");
	});

	it("handles root path", () => {
		expect(normalizeTrailingSlash("/")).toBe("/");
	});
});

describe("inferHomedir", () => {
	it("extracts homedir from macOS path", () => {
		expect(inferHomedir("/Users/alice/projects/foo")).toBe("/Users/alice");
	});

	it("extracts homedir from macOS path at user root", () => {
		expect(inferHomedir("/Users/alice")).toBe("/Users/alice");
	});

	it("extracts homedir from Linux path", () => {
		expect(inferHomedir("/home/bob/workspace/bar")).toBe("/home/bob");
	});

	it("extracts homedir from Linux path at user root", () => {
		expect(inferHomedir("/home/bob")).toBe("/home/bob");
	});

	it("handles root user on Linux", () => {
		expect(inferHomedir("/root/projects")).toBe("/root");
	});

	it("handles root user home directly", () => {
		expect(inferHomedir("/root")).toBe("/root");
	});

	it("returns empty string for unrecognized paths", () => {
		expect(inferHomedir("/var/lib/something")).toBe("");
	});

	it("returns empty string for empty input", () => {
		expect(inferHomedir("")).toBe("");
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
			TEST_HOMEDIR,
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
			`${TEST_HOMEDIR}/workplace/project-a`,
			config,
			TEST_HOMEDIR,
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
			`${TEST_HOMEDIR}/workplace/project-a`,
			config,
			TEST_HOMEDIR,
		);

		// Falls through to directory match
		expect(result).toEqual({ clusterId: "cluster-work", reason: "directory" });
	});

	it("matches directory by prefix", () => {
		const result = assignSessionToCluster(
			"session-1",
			`${TEST_HOMEDIR}/workplace/project-a`,
			baseConfig,
			TEST_HOMEDIR,
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
			`${TEST_HOMEDIR}/workspace/team-a/project`,
			config,
			TEST_HOMEDIR,
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
			`${TEST_HOMEDIR}/myprojects/foo`,
			config,
			TEST_HOMEDIR,
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
			`${TEST_HOMEDIR}/projects/deep/path`,
			config,
			TEST_HOMEDIR,
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
			`${TEST_HOMEDIR}/foobar/baz`,
			config,
			TEST_HOMEDIR,
		);

		expect(result).toEqual({ clusterId: null, reason: "none" });
	});

	it("returns unclustered when no match", () => {
		const result = assignSessionToCluster(
			"session-1",
			"/some/random/unmatched/path",
			baseConfig,
			TEST_HOMEDIR,
		);

		expect(result).toEqual({ clusterId: null, reason: "none" });
	});

	it("handles overlapping directories across clusters", () => {
		const config: ClusterConfig = {
			version: 1,
			clusters: [
				{
					id: "cluster-parent",
					name: "Parent",
					directories: ["/opt/projects"],
					sortOrder: 0,
				},
				{
					id: "cluster-child",
					name: "Child",
					directories: ["/opt/projects/team-x"],
					sortOrder: 1,
				},
			],
			manualAssignments: {},
		};

		// Session in the child directory matches the more specific cluster
		const childResult = assignSessionToCluster(
			"session-1",
			"/opt/projects/team-x/repo",
			config,
			TEST_HOMEDIR,
		);
		expect(childResult).toEqual({
			clusterId: "cluster-child",
			reason: "directory",
		});

		// Session in the parent directory (not under team-x) matches parent
		const parentResult = assignSessionToCluster(
			"session-2",
			"/opt/projects/team-y/repo",
			config,
			TEST_HOMEDIR,
		);
		expect(parentResult).toEqual({
			clusterId: "cluster-parent",
			reason: "directory",
		});
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
			`${TEST_HOMEDIR}/something`,
			config,
			TEST_HOMEDIR,
		);

		expect(result).toEqual({ clusterId: null, reason: "none" });
	});

	it("handles empty clusters array", () => {
		const config: ClusterConfig = {
			version: 1,
			clusters: [],
			manualAssignments: {},
		};

		const result = assignSessionToCluster(
			"session-1",
			"/some/path",
			config,
			TEST_HOMEDIR,
		);

		expect(result).toEqual({ clusterId: null, reason: "none" });
	});
});
