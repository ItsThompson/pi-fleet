import { z } from "zod";

const activitySchema = z.enum([
  "processing",
  "running_tool",
  "idle",
  "pending_approval",
]);

const contextUsageSchema = z.object({
  tokens: z.number().nullable(),
  contextWindow: z.number(),
  percent: z.number().nullable(),
});

export const registerBodySchema = z.object({
  sessionId: z.string().min(1),
  pid: z.number().int().positive(),
  cwd: z.string().min(1),
  tmuxTarget: z.string().nullable(),
  startTime: z.string().min(1),
  agentName: z.string().optional(),
  subagentId: z.string().optional(),
  model: z.string().optional(),
  contextUsage: contextUsageSchema.optional(),
  thinkingLevel: z.string().optional(),
});

export const heartbeatBodySchema = z.object({
  sessionId: z.string().min(1),
  activity: activitySchema,
  lastEventTime: z.string().min(1),
  tmuxTarget: z.string().nullable().optional(),
  agentName: z.string().optional(),
  model: z.string().optional(),
  contextUsage: contextUsageSchema.optional(),
  turnCount: z.number().int().nonnegative().optional(),
  thinkingLevel: z.string().optional(),
  lastToolName: z.string().optional(),
});

export type RegisterBodyParsed = z.infer<typeof registerBodySchema>;
export type HeartbeatBodyParsed = z.infer<typeof heartbeatBodySchema>;
