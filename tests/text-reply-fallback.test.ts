import { describe, expect, it } from 'vitest';
import { fallbackTextReplies } from '../core/companion.ts';

const petRequest = {
  tools: [
    { type: 'function', name: 'pet_say', description: '', parameters: {} },
    { type: 'function', name: 'end_turn', description: '', parameters: {} },
  ],
};

describe('fallbackTextReplies', () => {
  it('synthesizes pet_say and end_turn when model outputs assistant text without tool calls', async () => {
    const fakeGen = {
      response: {
        status: 'completed',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: '你好呀，今天过得怎么样？' }],
          },
        ],
      },
    };
    const core = {
      llm: {
        respond: async (..._args: unknown[]) => fakeGen,
      },
    };

    fallbackTextReplies(core as never);
    const result = await core.llm.respond(petRequest as never);

    const sayCall = result.response.output.find((i: any) => i.type === 'function_call' && i.name === 'pet_say');
    expect(sayCall).toBeDefined();
    expect(sayCall).toMatchObject({
      type: 'function_call',
      name: 'pet_say',
      status: 'completed',
    });
    expect(JSON.parse((sayCall as any).arguments)).toEqual({
      script: '你好呀，今天过得怎么样？',
    });

    const endCall = result.response.output.find((i: any) => i.type === 'function_call' && i.name === 'end_turn');
    expect(endCall).toBeDefined();
    expect(endCall).toMatchObject({
      type: 'function_call',
      name: 'end_turn',
      arguments: '{}',
      status: 'completed',
    });
  });

  it('does nothing when request tools do not include pet_say (e.g. fork subagent)', async () => {
    const fakeGen = {
      response: {
        status: 'completed',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Fork summary result' }],
          },
        ],
      },
    };
    const core = {
      llm: {
        respond: async (..._args: unknown[]) => fakeGen,
      },
    };

    fallbackTextReplies(core as never);
    const forkRequest = { tools: [{ type: 'function', name: 'read_file', description: '', parameters: {} }] };
    const result = await core.llm.respond(forkRequest as never);

    const call = result.response.output.find((i: any) => i.type === 'function_call');
    expect(call).toBeUndefined();
  });

  it('strips think blocks from assistant text before pet_say', async () => {
    const fakeGen = {
      response: {
        status: 'completed',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: '<think>Let me think...</think>库...我在呢！' }],
          },
        ],
      },
    };
    const core = {
      llm: {
        respond: async (..._args: unknown[]) => fakeGen,
      },
    };

    fallbackTextReplies(core as never);
    const result = await core.llm.respond(petRequest as never);

    const call = result.response.output.find((i: any) => i.type === 'function_call' && i.name === 'pet_say');
    expect(call).toBeDefined();
    expect(JSON.parse((call as any).arguments)).toEqual({
      script: '库...我在呢！',
    });
  });

  it('does not synthesize pet_say if function_call already exists', async () => {
    const fakeGen = {
      response: {
        status: 'completed',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Some thought or text' }],
          },
          {
            type: 'function_call',
            id: 'fc_1',
            call_id: 'call_1',
            name: 'pet_say',
            arguments: '{"script":"已有的说"}',
            status: 'completed',
          },
        ],
      },
    };
    const core = {
      llm: {
        respond: async (..._args: unknown[]) => fakeGen,
      },
    };

    fallbackTextReplies(core as never);
    const result = await core.llm.respond(petRequest as never);

    const calls = result.response.output.filter((i: any) => i.type === 'function_call');
    expect(calls).toHaveLength(1);
    expect(calls[0].id).toBe('fc_1');
  });

  it('does not synthesize pet_say when assistant text is empty', async () => {
    const fakeGen = {
      response: {
        status: 'completed',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: '   ' }],
          },
        ],
      },
    };
    const core = {
      llm: {
        respond: async (..._args: unknown[]) => fakeGen,
      },
    };

    fallbackTextReplies(core as never);
    const result = await core.llm.respond(petRequest as never);

    const call = result.response.output.find((i: any) => i.type === 'function_call');
    expect(call).toBeUndefined();
  });
});
