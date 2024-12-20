import { ChatCompletionRequestMessage, CreateChatCompletionRequest, CreateCompletionRequest, CreateCompletionResponse, StreamChatCompletionResponse } from '@anysphere/priompt/dist/openai';
import { encodingForModel } from "js-tiktoken";



export async function* streamChatLocalhost(createChatCompletionRequest: CreateChatCompletionRequest, options?: RequestInit, abortSignal?: AbortSignal) {
	let streamer: AsyncGenerator<StreamChatCompletionResponse> | undefined = undefined;

	const newAbortSignal = new AbortController();
	abortSignal?.addEventListener('abort', () => {
		newAbortSignal.abort();
	});

	let timeout = setTimeout(() => {
		console.error("OpenAI request timed out after 200 seconds..... Not good.")
		// Next, we abort the signal
		newAbortSignal.abort();
	}, 200_000);

	try {
		const prompt = joinMessages(createChatCompletionRequest.messages, true);
		let tokens = enc.encode(prompt).length;
		if (createChatCompletionRequest.model.includes('00')) {
			tokens = enc_old.encode(prompt).length;
		}
		const maxTokens = Math.min((getTokenLimit(createChatCompletionRequest.model)) - tokens, getOutputTokenLimit(createChatCompletionRequest.model))
		const requestOptions: RequestInit = {
			...options,
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			signal: newAbortSignal.signal,
			body: JSON.stringify({
				...createChatCompletionRequest,
				...(
					openaiNonStreamableModels.includes(createChatCompletionRequest.model) ? {
						stream: undefined,
						max_tokens: undefined,
					} : {
						stream: true,
						max_tokens: maxTokens
					}
				)
			}),
		};

		// const url = getBaseUrl(createChatCompletionRequest.model) + '/chat/completions';
		const response = await fetch('http://localhost:8000/priompt/chat/completions', requestOptions);
		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}. message: ${await response.text()}`);
		}
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		streamer = streamSource<StreamChatCompletionResponse>(response.body!);
		for await (const data of streamer) {
			clearTimeout(timeout);

			timeout = setTimeout(() => {
				console.error("OpenAI request timed out after 10 seconds..... Not good.")
				newAbortSignal.abort();
			}, 10_000);

			yield data;

			clearTimeout(timeout);
		}
	} finally {
		clearTimeout(timeout);
		if (streamer !== undefined) {
			await streamer.return(undefined);
		}
		newAbortSignal.abort();
	}
}

const getOutputTokenLimit = (model: string) => {
	if (model.includes('22b')) {
		return 32_768;
	} else if (model.includes("claude-3-5-sonnet-20240620")) {
		return 8_192;
	} else {
		return 4_096;
	}
}

const getTokenLimit = (model: string) => {
	const maybeTokenLimit = TOKEN_LIMIT[model];
	if (maybeTokenLimit !== undefined) {
		return maybeTokenLimit;
	}

	if (model.includes('22b')) {
		return 32_768;
	}

	return 1_000_000;
}

const TOKEN_LIMIT: Record<string, number> = {
	"gpt-3.5-turbo": 4096,
	"azure-3.5-turbo": 4096,
	"gpt-4": 8192,
	"gpt-4-cursor-completions": 128_000,
	"gpt-4-cursor-vinod": 128_000,
	"gpt-4-0314": 8192,
	"gpt-4-32k": 32000,
	"gpt-4-1106-preview": 128000,
	"gpt-4-0125-preview": 128000,
	"gpt-3.5-turbo-1106": 16000,
	"text-davinci-003": 4096,
	"code-davinci-002": 4096,
};
const enc = encodingForModel("gpt-4");
const enc_old = encodingForModel("text-davinci-003");

const openaiNonStreamableModels = ["o1-mini-2024-09-12", "o1-preview-2024-09-12"];

// TODO (Aman): Make this work for non-oai models (or error if it doesn't work for them)!
export async function* streamChatCompletionLocalhost(createChatCompletionRequest: CreateChatCompletionRequest, options?: RequestInit, abortSignal?: AbortSignal): AsyncGenerator<StreamChatCompletionResponse> {
	// If this is an anthropic or fireworks model, we can streamchat having partially filled in the last assistant message
	if (createChatCompletionRequest.model.includes('claude-3') || createChatCompletionRequest.model.includes('deepseek')) {
		// The last message must be an assistant message
		if (createChatCompletionRequest.messages.length === 0 || createChatCompletionRequest.messages[createChatCompletionRequest.messages.length - 1].role !== 'assistant') {
			throw new Error('Last message must not be an assistant message');
		}
		yield* streamChatLocalhost(createChatCompletionRequest, options, abortSignal);
		return;
	}
	const prompt = joinMessages(createChatCompletionRequest.messages, true);
	let tokens = enc.encode(prompt).length;
	if (createChatCompletionRequest.model.includes('00')) {
		tokens = enc_old.encode(prompt).length;
	}
	const createCompletionRequest = {
		max_tokens: Math.min((getTokenLimit(createChatCompletionRequest.model)) - tokens, getOutputTokenLimit(createChatCompletionRequest.model)), // hacky but most models only support 4k output tokens
		...createChatCompletionRequest,
		messages: undefined,
		prompt,
		stop: ['<|im_end|>', '<|diff_marker|>']
	} as CreateCompletionRequest;


	let streamer: AsyncGenerator<CreateCompletionResponse> | undefined = undefined;

	const newAbortSignal = new AbortController();
	abortSignal?.addEventListener('abort', () => {
		newAbortSignal.abort();
	});

	let timeout = setTimeout(() => {
		console.error("OpenAI request timed out after 200 seconds..... Not good.")
		newAbortSignal.abort();
	}, 200_000);

	try {
		const requestOptions: RequestInit = {
			...options,
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			signal: newAbortSignal.signal,
			body: JSON.stringify({
				...createCompletionRequest,
				stream: true
			}),
		};

		const response = await fetch('http://localhost:8000/priompt/completions', requestOptions);
		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}. message: ${await response.text()}`);
		}
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		streamer = streamSource<CreateCompletionResponse>(response.body!);
		for await (const data of streamer) {
			clearTimeout(timeout);

			timeout = setTimeout(() => {
				console.error("OpenAI request timed out after 10 seconds..... Not good.")
				newAbortSignal.abort();
			}, 10_000);

			yield {
				...data,
				choices: data.choices.map((choice) => {
					return {
						delta: {
							role: 'assistant',
							content: choice.text?.replace(prompt, ''),
						}
					}
				})
			}

			clearTimeout(timeout);
		}
	} finally {
		clearTimeout(timeout);
		if (streamer !== undefined) {
			await streamer.return(undefined);
		}
		newAbortSignal.abort();
	}
}


async function* streamSource<T>(stream: ReadableStream): AsyncGenerator<T> {
	// Buffer exists for overflow when event stream doesn't end on a newline
	let buffer = '';

	// Create a reader to read the response body as a stream
	const reader = stream.getReader();

	// Loop until the stream is done
	while (true) {
		const { done, value } = await reader.read();
		if (done) {
			break;
		}

		buffer += new TextDecoder().decode(value);
		const lines = buffer.split('\n');
		for (const line of lines.slice(0, -1)) {
			if (line.startsWith('data: ')) {
				const jsonString = line.slice(6);
				if (jsonString === '[DONE]') {
					return;
				}
				try {
					const ans = JSON.parse(jsonString) as T;
					yield ans;
				} catch (e) {
					console.log(jsonString);
					throw e;
				}
			}
		}
		buffer = lines[lines.length - 1];
	}

	if (buffer.startsWith('data: ')) {
		const jsonString = buffer.slice(6);
		if (jsonString === '[DONE]') {
			return;
		}
		try {
			const ans = JSON.parse(jsonString) as T;
			yield ans;
		} catch (e) {
			console.log(jsonString);
			throw e;
		}
	}
}

export function joinMessages(messages: ChatCompletionRequestMessage[], lastIsIncomplete: boolean = false, isLlama: boolean = false) {
	if (!isLlama) {
		return messages.map((message, index) => {
			let ret = `<|im_start|>${message.role}<|im_sep|>${message.content}`;
			if (!lastIsIncomplete || index !== messages.length - 1) {
				ret += `<|im_end|>`;
			}
			return ret;
		}).join('');
	} else {
		let ret = '<|begin_of_text|>'
		for (const [index, message] of messages.entries()) {
			ret += `<|start_header_id|>${message.role}<|end_header_id|>${message.content}`;
			if (!lastIsIncomplete || index !== messages.length - 1) {
				ret += `<|eot_id|>`;
			}
		}
		return ret;
	}
}
