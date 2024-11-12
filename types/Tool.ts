

import { Anthropic } from "@anthropic-ai/sdk";

export type ToolName = "execute_command" | "list_files" | "list_code_definition_names" | "search_files" | "read_file" | "write_to_file" | "ask_followup_question" | "attempt_completion";

export type ToolResponse = string | Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam>;

export interface Tool {
    name: ToolName;
    description: string;
    input_schema: {
        type: "object";
        properties: {
            [key: string]: {
                type: string;
                description: string;
            };
        };
        required: string[];
    };
}

