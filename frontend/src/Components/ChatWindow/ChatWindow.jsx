import "./ChatWindow.css";
import {
    useEffect,
    useRef,
    useState,
} from "react";
import Messages from "./Messages";
import ChatbotDriver, {
    INITIAL_BOT_MESSAGE,
} from "./ChatbotDriver.js";

function ChatWindow() {
    // Create a single ChatbotDriver instance that persists for the
    // lifetime of this component. Using useRef prevents a new chatbot
    // from being created on every render.
    const chatbotRef = useRef(new ChatbotDriver());

    // Tracks the next unique id that should be assigned to a message.
    // Stored in a ref because changing it should not trigger a re-render.
    const nextMessageIdRef = useRef(2);

    // Reference to the text input so we can automatically place the
    // cursor back into it after the chatbot responds.
    const inputRef = useRef(null);

    // Reference to a dummy element at the bottom of the chat. Scrolling
    // this element into view causes the chat window to scroll down.
    const scrollRef = useRef(null);

    // Current text entered by the user.
    const [input, setInput] = useState("");

    // Indicates whether the chatbot is currently processing a response.
    // Used to disable the input and prevent duplicate submissions.
    const [isResponding, setIsResponding] =
        useState(false);

    // Indicates whether the conversation has ended. Once true,
    // the input field and send button remain disabled.
    const [isClosed, setIsClosed] =
        useState(false);

    // Stores every message displayed in the chat window.
    // The conversation begins with the chatbot's initial greeting.
    const [messages, setMessages] = useState([
        {
            id: 1,
            sender: "bot",
            text: INITIAL_BOT_MESSAGE,
        },
    ]);

    // Whenever the chatbot finishes responding, automatically place the
    // cursor back into the input field unless the conversation has ended.
    useEffect(() => {
        if (!isResponding && !isClosed) {
            inputRef.current?.focus();
        }
    }, [isResponding, isClosed]);

    // Creates a standardized message object with a unique id.
    function createMessage(sender, text) {
        const message = {
            id: nextMessageIdRef.current,
            sender,
            text,
        };

        nextMessageIdRef.current += 1;

        return message;
    }

    // Whenever a new message is added to the conversation,
    // automatically scroll the chat window to the latest message.
    useEffect(() => {
        scrollRef.current?.scrollIntoView({
            behavior: "smooth",
        });
    }, [messages]);

    // Handles form submission by:
    // 1. Validating the user's input.
    // 2. Displaying the user's message.
    // 3. Passing the message to the chatbot state machine.
    // 4. Displaying the chatbot's response(s).
    // 5. Handling any unexpected errors.
    const handleSubmit = async (event) => {
        event.preventDefault();

        // Remove leading and trailing whitespace.
        const cleanedInput = input.trim();

        // Ignore empty messages, duplicate submissions while the
        // chatbot is responding, or submissions after the chat ends.
        if (
            !cleanedInput ||
            isResponding ||
            isClosed
        ) {
            return;
        }

        // Create and display the user's message.
        const userMessage = createMessage(
            "user",
            cleanedInput
        );

        setMessages((currentMessages) => [
            ...currentMessages,
            userMessage,
        ]);

        // Clear the input box and disable further submissions while
        // waiting for the chatbot.
        setInput("");
        setIsResponding(true);

        try {
            // Let the chatbot process the user's message.
            // The chatbot may return multiple responses.
            const botResponses =
                await chatbotRef.current.processMessage(
                    cleanedInput
                );

            // Convert each response string into a message object.
            const botMessages = botResponses.map(
                (response) =>
                    createMessage("bot", response)
            );

            // Append all chatbot messages to the conversation.
            setMessages((currentMessages) => [
                ...currentMessages,
                ...botMessages,
            ]);

            // If the chatbot reached its terminal state,
            // disable further interaction.
            if (chatbotRef.current.isClosed()) {
                setIsClosed(true);
            }
        } catch (error) {
            // Log unexpected errors for debugging.
            console.error(error);

            // Display a generic error message to the user.
            const errorMessage = createMessage(
                "bot",
                "Something went wrong while processing your response."
            );

            setMessages((currentMessages) => [
                ...currentMessages,
                errorMessage,
            ]);
        } finally {
            // Re-enable the input regardless of whether processing
            // succeeded or failed.
            setIsResponding(false);
        }
    };

    return (
        <div className="chat-window">
            {/* Displays the conversation history. The scrollRef points
                to a dummy element at the bottom of the messages list
                for automatic scrolling. */}
            <Messages
                messages={messages}
                scrollRef={scrollRef}
            />

            {/* Form used to submit user responses to the chatbot. */}
            <form
                className="response-window"
                onSubmit={handleSubmit}
            >
                <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(event) =>
                        setInput(event.target.value)
                    }
                    placeholder={
                        isClosed
                            ? "Conversation closed"
                            : "Enter your response here"
                    }
                    disabled={
                        isResponding || isClosed
                    }
                />

                <button
                    type="submit"
                    disabled={
                        isResponding || isClosed
                    }
                >
                    {isResponding
                        ? "Sending..."
                        : "Send"}
                </button>
            </form>
        </div>
    );
}

export default ChatWindow;