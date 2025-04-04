let messageInput, sendBtn, chatContainer;
const CHIEF_AI_FUNCTION_URL = 'https://chiefai-xu2mpqavca-uc.a.run.app';

document.addEventListener("DOMContentLoaded", () => {
    messageInput = document.getElementById("message-input");
    sendBtn = document.getElementById("send-btn");
    chatContainer = document.getElementById("chat-container");

    messageInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
        sendBtn.disabled = !this.value.trim();
    });

    sendBtn.addEventListener("click", handleUserMessage);
    messageInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (!sendBtn.disabled) handleUserMessage();
        }
    });
});

function fillPrompt(promptText) {
    messageInput.value = promptText;
    messageInput.style.height = 'auto';
    messageInput.style.height = (messageInput.scrollHeight) + 'px';
    messageInput.focus();
    sendBtn.disabled = false;
    handleUserMessage();
}

async function handleUserMessage() {
    const userMessage = messageInput.value.trim();
    if (!userMessage) return;

    appendMessage("user", userMessage);
    messageInput.value = "";
    messageInput.style.height = 'auto';
    sendBtn.disabled = true;

    const typingId = showTypingIndicator();

    try {
        const isInitialRequest = !document.querySelector('.recipe-suggestion');
        const prompt = isInitialRequest
            ? createInitialPrompt(userMessage)
            : createDetailPrompt(userMessage);

        const response = await callChiefAI(prompt);
        removeTypingIndicator(typingId);
        processAIResponse(response, isInitialRequest);

    } catch (error) {
        console.error("API Error:", error);
        removeTypingIndicator(typingId);
        showErrorMessage(error.message);
    }
}

async function callChiefAI(prompt, retries = 3) {
    try {
        const response = await fetch(CHIEF_AI_FUNCTION_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify({ prompt })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(
                errorData.error ||
                errorData.message ||
                `Request failed with status ${response.status}`
            );
        }

        const data = await response.json();

        if (!data.reply) {
            throw new Error("Received empty response from the server");
        }

        return data.reply;

    } catch (error) {
        if (retries > 0) {
            console.log(`Retrying... attempts left: ${retries}`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            return callChiefAI(prompt, retries - 1);
        }
        throw error;
    }
}

function createInitialPrompt(ingredients) {
    return `I have these ingredients: ${ingredients}. Suggest 3 specific recipes I can make. For each provide:
        1. Creative recipe name
        2. One-sentence description
        3. Main ingredients used
        Format each like: ## [Name]\n[Description] Ingredients: [ingredients]`;
}

function createDetailPrompt(recipeName) {
    return `Provide detailed instructions for: ${recipeName}. Include:
        1. Ingredients list with quantities
        2. Step-by-step instructions
        3. Cooking time
        4. Serving size
        Format with markdown headers (### for sections)`;
}

function processAIResponse(response, isInitialRequest) {
    try {
        if (isInitialRequest) {
            const suggestions = parseSuggestions(response);
            if (suggestions.length > 0) {
                showRecipeSuggestions(suggestions);
            } else {
                appendMessage("ai", response);
            }
        } else {
            appendMessage("ai", formatRecipeResponse(response));
        }
    } catch (error) {
        console.error("Response processing error:", error);
        appendMessage("ai", "I received an unexpected response format. Please try again.");
    }
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function showErrorMessage(error) {
    let userMessage = "Oops! Something went wrong. Please try again.";

    if (error.includes("Failed to fetch")) {
        userMessage = "Network error. Please check your internet connection.";
    } else if (error.includes("500") || error.includes("Internal Server Error")) {
        userMessage = "Server is temporarily unavailable. Please try again later.";
    } else if (error.includes("Request failed with status 429")) {
        userMessage = "Too many requests. Please wait a moment before trying again.";
    }

    appendMessage("ai", userMessage);
}

function parseSuggestions(text) {
    try {
        const suggestions = [];
        const lines = text.split('\n');
        let currentSuggestion = null;

        for (const line of lines) {
            if (line.startsWith('## ')) {
                if (currentSuggestion) suggestions.push(currentSuggestion);
                currentSuggestion = {
                    name: line.substring(3).trim(),
                    description: '',
                    ingredients: ''
                };
            } else if (currentSuggestion) {
                if (line.includes('Ingredients:')) {
                    currentSuggestion.ingredients = line.split('Ingredients:')[1].trim();
                } else if (line.trim() && !currentSuggestion.description) {
                    currentSuggestion.description = line.trim();
                }
            }
        }

        if (currentSuggestion) suggestions.push(currentSuggestion);
        return suggestions;
    } catch (error) {
        console.error("Failed to parse suggestions:", error);
        return [];
    }
}

function showRecipeSuggestions(suggestions) {
    try {
        const suggestionsDiv = document.createElement('div');
        suggestionsDiv.className = 'recipe-suggestions';

        suggestions.forEach(suggestion => {
            const suggestionDiv = document.createElement('div');
            suggestionDiv.className = 'recipe-suggestion';
            suggestionDiv.innerHTML = `
                <h3>${suggestion.name}</h3>
                <p>${suggestion.description}</p>
                <div class="ingredients">${suggestion.ingredients}</div>
            `;
            suggestionDiv.addEventListener('click', () => {
                messageInput.value = suggestion.name;
                messageInput.style.height = 'auto';
                messageInput.style.height = (messageInput.scrollHeight) + 'px';
                handleUserMessage();
            });
            suggestionsDiv.appendChild(suggestionDiv);
        });

        const messageElement = document.createElement('div');
        messageElement.classList.add("message", "message-ai");
        messageElement.innerHTML = `
            <div class="message-avatar">AI</div>
            <div class="message-content"></div>
        `;
        messageElement.querySelector('.message-content').appendChild(suggestionsDiv);
        chatContainer.appendChild(messageElement);
    } catch (error) {
        console.error("Error showing suggestions:", error);
        appendMessage("ai", "Here are some recipe ideas: " + JSON.stringify(suggestions));
    }
}

function formatRecipeResponse(text) {
    try {
        return text
            .replace(/^### (.*$)/gm, '<h3>$1</h3>')
            .replace(/^## (.*$)/gm, '<h2>$1</h2>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br>');
    } catch (error) {
        console.error("Error formatting response:", error);
        return text;
    }
}

function appendMessage(sender, text) {
    const messageElement = document.createElement("div");
    messageElement.classList.add("message", sender === "ai" ? "message-ai" : "message-user");
    messageElement.innerHTML = `
        <div class="message-avatar">${sender === "ai" ? "AI" : "You"}</div>
        <div class="message-content">${text}</div>
    `;
    chatContainer.appendChild(messageElement);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function showTypingIndicator() {
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message message-ai';
    typingDiv.id = 'typing-indicator';
    typingDiv.innerHTML = `
        <div class="message-avatar">AI</div>
        <div class="message-content">
            <div class="typing-indicator">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            </div>
        </div>
    `;
    chatContainer.appendChild(typingDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    return 'typing-indicator';
}

function removeTypingIndicator(id) {
    const typingElement = document.getElementById(id);
    if (typingElement) typingElement.remove();
}
