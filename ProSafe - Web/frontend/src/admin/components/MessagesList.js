import MessageItem from "./MessageItem";

const MessagesList = () => {
  const messages = [1, 2, 3];

  return (
    <div className="card messages-card">
      <h3>Messages</h3>

      <div className="messages-list">
        {messages.map((m, i) => (
          <MessageItem key={i} />
        ))}
      </div>
    </div>
  );
};

export default MessagesList;
