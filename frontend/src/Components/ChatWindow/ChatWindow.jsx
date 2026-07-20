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
    const chatbotRef = useRef(new ChatbotDriver());
    const nextMessageIdRef = useRef(2);
    const inputRef = useRef(null);
    const [input, setInput] = useState("");
    const [isResponding, setIsResponding] = useState(false);
    const [isClosed, setIsClosed] = useState(false);
    const [messages, setMessages] = useState([
        {
            id: 1,
            sender: "bot",
            text: INITIAL_BOT_MESSAGE,
        },
    ]);

    useEffect(() => {
        if (!isResponding && !isClosed) {
            inputRef.current?.focus();
        }
    }, [isResponding, isClosed]);

    function createMessage(sender, text) {
        const message = {
            id: nextMessageIdRef.current,
            sender,
            text,
        };

        nextMessageIdRef.current += 1;

        return message;
    }

    const handleSubmit = async (event) => {
        event.preventDefault();

        const cleanedInput = input.trim();

        if (
            !cleanedInput ||
            isResponding ||
            isClosed
        ) {
            return;
        }

        const userMessage = createMessage(
            "user",
            cleanedInput
        );

        setMessages((currentMessages) => [
            ...currentMessages,
            userMessage,
        ]);

        setInput("");
        setIsResponding(true);

        try {
            const botResponses =
                await chatbotRef.current.processMessage(
                    cleanedInput
                );

            const botMessages = botResponses.map(
                (response) =>
                    createMessage("bot", response)
            );

            setMessages((currentMessages) => [
                ...currentMessages,
                ...botMessages,
            ]);

            if (chatbotRef.current.isClosed()) {
                setIsClosed(true);
            }
        } catch (error) {
            console.error(error);

            const errorMessage = createMessage(
                "bot",
                "Something went wrong while processing your response."
            );

            setMessages((currentMessages) => [
                ...currentMessages,
                errorMessage,
            ]);
        } finally {
            setIsResponding(false);
        }
    };

    return (
        <div className="chat-window">
            <Messages messages={messages} />

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