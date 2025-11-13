import { AgentCard } from "@a2a-js/sdk";
import { A2AClient } from "@a2a-js/sdk/client";
import React from "react";

import { useToastContext } from "@/contexts/ToastContext";
import { createA2AProxyFetch } from "@/lib/api/proxy-fetch";
import { parseAgentUrls } from "@/lib/env";

export interface UseAgentsReturn {
  agents: AgentCard[];
  activeAgent: AgentCard | null;
  addAgentByUrl: (url: string) => Promise<void>;
  setActiveAgent: (agent: AgentCard | null) => void;
}

interface UseAgentsParams {
  customHeaders?: Record<string, string>;
}

export const useAgents = (params?: UseAgentsParams): UseAgentsReturn => {
  const [agents, setAgents] = React.useState<AgentCard[]>([]);
  const [activeAgent, setActiveAgent] = React.useState<AgentCard | null>(null);

  const { showToast } = useToastContext();

  const addAgentByUrl = async (url: string): Promise<void> => {
    if (!url.trim()) {
      return;
    }

    try {
      const A2AProxyFetch: typeof fetch = createA2AProxyFetch(params?.customHeaders);
      const client: A2AClient = await A2AClient.fromCardUrl(url.trim(), {
        fetchImpl: A2AProxyFetch,
      });
      const agentCard: AgentCard = await client.getAgentCard();

      setAgents((prev) => {
        // Check if agent already exists
        const existingIndex = prev.findIndex(
          (existingAgent) => existingAgent.url === agentCard.url
        );

        const newAgents = [...prev];

        if (existingIndex === -1) {
          // Add the new agent
          newAgents.push(agentCard);
        } else {
          // Replace the existing agent
          newAgents[existingIndex] = agentCard;
        }

        return newAgents;
      });

      setActiveAgent(agentCard);
      showToast(`Added ${agentCard.name}`, "success");
    } catch (error) {
      console.error("Error adding agent:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      showToast(`Failed to fetch agent card: ${errorMessage}`, "error");
      throw error; // Re-throw so the component can handle loading states
    }
  };

  // Load default agent URLs on mount
  React.useEffect(() => {
    const defaultUrls: string[] = parseAgentUrls(process.env.NEXT_PUBLIC_DEFAULT_AGENT_URLS);

    for (const url of defaultUrls) {
      addAgentByUrl(url);
    }
  }, []);

  return {
    agents,
    activeAgent,
    addAgentByUrl,
    setActiveAgent,
  };
};
