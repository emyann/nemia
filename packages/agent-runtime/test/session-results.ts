/**
 * Three `result` lines of `claude -p`, cut from the store to what the readers read: a session whose work its subagents did,
 * where `usage` counts the main thread and `modelUsage` every model; and a session and its resume, whose `modelUsage` and cost
 * carry the first try's on where its `usage` counts its own.
 */

/** rewrite-six-of-the-orchestra-uv7v's implement: Grace and four subagents, $36.83. */
export const UV7V_IMPLEMENT =
  '{"type":"result","total_cost_usd":36.826279499999984,"duration_api_ms":4764556,"usage":{"input_tokens":220,"cache_creation_input_tokens":290851,"cache_read_input_tokens":22286449,"output_tokens":81374},"modelUsage":{"claude-haiku-5-5":{"inputTokens":20922,"outputTokens":29,"cacheReadInputTokens":0,"cacheCreationInputTokens":0},"claude-opus-5-5":{"inputTokens":3067,"outputTokens":518312,"cacheReadInputTokens":91120709,"cacheCreationInputTokens":1469794}}}';

/** rewrite-the-test-suites-into-h4sj's implement, try 1. */
export const H4SJ_IMPLEMENT =
  '{"type":"result","total_cost_usd":42.2155957,"duration_api_ms":6660374,"usage":{"input_tokens":196,"cache_creation_input_tokens":265648,"cache_read_input_tokens":16574059,"output_tokens":93274},"modelUsage":{"claude-haiku-5-5":{"inputTokens":21046,"outputTokens":27,"cacheReadInputTokens":0,"cacheCreationInputTokens":0},"claude-opus-5-5":{"inputTokens":1324,"outputTokens":694012,"cacheReadInputTokens":85418088,"cacheCreationInputTokens":2089476}}}';

/** Its try 2, a resume of try 1: its cost and `modelUsage` carry try 1's on. */
export const H4SJ_IMPLEMENT_TRY2 =
  '{"type":"result","total_cost_usd":43.542763699999995,"duration_api_ms":6790456,"usage":{"input_tokens":28,"cache_creation_input_tokens":30746,"cache_read_input_tokens":4209340,"output_tokens":11961},"modelUsage":{"claude-haiku-5-5":{"inputTokens":21046,"outputTokens":27,"cacheReadInputTokens":0,"cacheCreationInputTokens":0},"claude-opus-5-5":{"inputTokens":1352,"outputTokens":705973,"cacheReadInputTokens":89627428,"cacheCreationInputTokens":2120222}}}';
