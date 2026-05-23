export function serializeMessages(messages) {
  let systemPrompt = '';
  const systemMessages = messages.filter(m => m.role === 'system');
  if (systemMessages.length > 0) {
    systemPrompt = systemMessages.map(m => m.content).join('\n');
  }

  const chatMessages = messages.filter(m => m.role !== 'system');
  let promptText = '';
  if (chatMessages.length === 1 && chatMessages[0].role === 'user') {
    promptText = chatMessages[0].content;
  } else {
    // Construct standard chat prompt transcript
    promptText = chatMessages.map(m => {
      const roleName = m.role === 'assistant' ? 'Assistant' : 'User';
      return `${roleName}: ${m.content}`;
    }).join('\n\n');
  }

  return { systemPrompt, promptText };
}

export function serializeChunk(id, model, content, finishReason = null) {
  return {
    id,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        delta: content ? { content } : {},
        finish_reason: finishReason
      }
    ]
  };
}

export function serializeCompletion(id, model, content, usage = null) {
  return {
    id,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: content
        },
        finish_reason: 'stop'
      }
    ],
    usage: usage || {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0
    }
  };
}
