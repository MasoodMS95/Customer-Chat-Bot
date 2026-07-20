function Messages({ messages, scrollRef }) {
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
            <div ref={scrollRef}/>
        </div>
    );
}

export default Messages;