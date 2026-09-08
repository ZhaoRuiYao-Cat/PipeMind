"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { API_BASE } from "./api";
import { useI18n } from "./i18n";
import { notifyDataChanged } from "./data-events";

export interface ChatMessageItem {
  id: number;
  role: "user" | "agent";
  content: string;
}

interface ChatValue {
  messages: ChatMessageItem[];
  sending: boolean;
  send: (content: string) => Promise<void>;
  clear: () => void;
}

const INITIAL_CHAT: ChatValue = {
  messages: [],
  sending: false,
  send: async () => {
    void 0;
  },
  clear: () => {
    void 0;
  },
};

const ChatContext = createContext<ChatValue>(INITIAL_CHAT);

export function ChatProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [sending, setSending] = useState(false);
  const nextId = useRef(1);

  const send = useCallback(
    async (content: string): Promise<void> => {
      const trimmed = content.trim();
      if (!trimmed || sending) {
        return;
      }
      const userMessage: ChatMessageItem = {
        id: nextId.current,
        role: "user",
        content: trimmed,
      };
      nextId.current += 1;
      const history = [...messages, userMessage];
      setMessages(history);
      setSending(true);
      try {
        const wire = history.map((item) => ({
          role: item.role === "user" ? "user" : "assistant",
          content: item.content,
        }));
        const response = await fetch(`${API_BASE}/ai/chat`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: wire }),
        });
        const data = (await response.json()) as {
          reply?: string;
          message?: string | string[];
          executedTools?: string[];
        };
        if (!response.ok || !data.reply) {
          const message = Array.isArray(data.message)
            ? data.message.join("，")
            : (data.message ?? t("homeChatFailed"));
          throw new Error(message);
        }
        if (Array.isArray(data.executedTools) && data.executedTools.length > 0) {
          notifyDataChanged();
        }
        const agentMessage: ChatMessageItem = {
          id: nextId.current,
          role: "agent",
          content: data.reply,
        };
        nextId.current += 1;
        setMessages((current) => [...current, agentMessage]);
      } catch (err) {
        const agentMessage: ChatMessageItem = {
          id: nextId.current,
          role: "agent",
          content:
            err instanceof Error ? err.message : t("homeChatFailed"),
        };
        nextId.current += 1;
        setMessages((current) => [...current, agentMessage]);
      } finally {
        setSending(false);
      }
    },
    [messages, sending, t],
  );

  const clear = useCallback((): void => {
    setMessages([]);
    nextId.current = 1;
  }, []);

  return (
    <ChatContext.Provider
      value={{
        messages,
        sending,
        send,
        clear,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat(): ChatValue {
  return useContext(ChatContext);
}
