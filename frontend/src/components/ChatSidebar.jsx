import { useEffect, useRef, useState } from 'react';
import { groupConversations } from '../lib/chatGroups';

const Icon = ({ children, size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

function ConversationItem({ conversation, active, onOpen, onDelete, onRename }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(conversation.title);
  const [confirming, setConfirming] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  // An armed delete disarms itself, so a stray click an hour later cannot confirm it.
  useEffect(() => {
    if (!confirming) return undefined;
    const timer = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(timer);
  }, [confirming]);

  const commit = () => {
    const title = draft.trim();
    setEditing(false);
    if (title && title !== conversation.title) onRename(conversation.id, title);
    else setDraft(conversation.title);
  };

  if (editing) {
    return (
      <li className="chat-history-item is-editing">
        <input
          ref={inputRef}
          className="chat-history-rename"
          value={draft}
          maxLength={120}
          aria-label="Conversation title"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') {
              setDraft(conversation.title);
              setEditing(false);
            }
          }}
        />
      </li>
    );
  }

  return (
    <li className={`chat-history-item${active ? ' is-active' : ''}`}>
      <button
        type="button"
        className="chat-history-open"
        onClick={() => onOpen(conversation.id)}
        aria-current={active ? 'true' : undefined}
        title={conversation.title}
      >
        <span>{conversation.title}</span>
      </button>
      <span className="chat-history-actions">
        <button
          type="button"
          aria-label={`Rename ${conversation.title}`}
          title="Rename"
          onClick={() => {
            setDraft(conversation.title);
            setEditing(true);
          }}
        >
          <Icon>
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </Icon>
        </button>
        <button
          type="button"
          className={confirming ? 'is-armed' : ''}
          aria-label={confirming ? 'Confirm delete' : `Delete ${conversation.title}`}
          title={confirming ? 'Click again to delete' : 'Delete'}
          onClick={() => (confirming ? onDelete(conversation.id) : setConfirming(true))}
        >
          {confirming ? (
            <span className="chat-history-confirm">Delete?</span>
          ) : (
            <Icon>
              <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
            </Icon>
          )}
        </button>
      </span>
    </li>
  );
}

export default function ChatSidebar({
  conversations,
  activeId,
  enabled,
  open,
  onClose,
  onNew,
  onOpen,
  onDelete,
  onRename,
}) {
  const groups = groupConversations(conversations);

  return (
    <>
      {open && <div className="chat-sidebar-scrim" onClick={onClose} aria-hidden="true" />}
      <aside
        className={`chat-sidebar${open ? ' is-open' : ''}`}
        aria-label="Chat history"
        id="chat-history"
      >
        <button type="button" className="chat-new-button" onClick={onNew}>
          <Icon size={18}>
            <path d="M12 5v14M5 12h14" />
          </Icon>
          New chat
        </button>

        <div className="chat-history-scroll">
          {!enabled && (
            <p className="chat-history-note">
              Sign in with an account to keep your chats. Guest chats last only until you close this
              tab.
            </p>
          )}

          {enabled && groups.length === 0 && (
            <p className="chat-history-note">
              Your conversations will show up here, grouped by Today and Yesterday.
            </p>
          )}

          {groups.map((group) => (
            <section key={group.label} className="chat-history-group">
              <h3>{group.label}</h3>
              <ul>
                {group.items.map((conversation) => (
                  <ConversationItem
                    key={conversation.id}
                    conversation={conversation}
                    active={conversation.id === activeId}
                    onOpen={(id) => {
                      onOpen(id);
                      onClose();
                    }}
                    onDelete={onDelete}
                    onRename={onRename}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      </aside>
    </>
  );
}
