function Messages({ messages }) {
    return (
        <div className="messages">
            {messages.map((message) => (
                <div
                    key={message.id}
                    className={`messageRow ${message.sender}`}
                >
                    <div className="messageBubble">
                        {message.text}
                    </div>
                </div>
            ))}
        </div>
    );
}

export default Messages;