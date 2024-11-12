import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as diff from 'diff';
import { ToolResponse, ToolName } from '../../types/index'
const execAsync = promisify(exec);


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


const cwd = process.cwd();
const LIST_FILES_LIMIT = 1000;

export class ToolManager {
    private tools: Tool[];

    constructor() {
        this.tools = [];
    }

    registerTool(tool: Tool): void {
        this.tools.push(tool);
    }

    async executeTool(toolName: ToolName, toolInput: Record<string, unknown>): Promise<ToolResponse> {
        const tool = this.tools.find(t => t.name === toolName);
        if (!tool) {
            throw new Error(`Unknown tool: ${toolName}`);
        }

        this.validateToolInput(tool, toolInput);

        return await this.executeToolImplementation(toolName, toolInput);
    }

    private validateToolInput(tool: Tool, toolInput: Record<string, unknown>): void {
        for (const requiredParam of tool.input_schema.required) {
            if (!(requiredParam in toolInput)) {
                throw new Error(`Missing required parameter: ${requiredParam} for tool: ${tool.name}`);
            }
        }
    }

    private async executeToolImplementation(toolName: ToolName, toolInput: Record<string, unknown>): Promise<ToolResponse> {
        switch (toolName) {
            case "execute_command":
                return this.executeCommand(toolInput.command as string);
            case "list_files":
                return this.listFiles(toolInput.path as string, toolInput.recursive as string);
            case "list_code_definition_names":
                return this.listCodeDefinitionNames(toolInput.path as string);
            case "search_files":
                return this.searchFiles(toolInput.path as string, toolInput.regex as string, toolInput.filePattern as string);
            case "read_file":
                return this.readFile(toolInput.path as string);
            case "write_to_file":
                return this.writeToFile(toolInput.path as string, toolInput.content as string);
            case "ask_followup_question":
                return this.askFollowupQuestion(toolInput.question as string);
            case "attempt_completion":
                return this.attemptCompletion(toolInput.result as string, toolInput.command as string);
            default:
                throw new Error(`Unimplemented tool: ${toolName}`);
        }
    }

    private async executeCommand(command: string): Promise<ToolResponse> {
        try {
            const { stdout, stderr } = await execAsync(command);
            return stdout || stderr;
        } catch (error) {
            return this.formatToolError(`Error executing command: ${(error as Error).message}`);
        }
    }

    private async listFiles(dirPath: string, recursive?: string): Promise<ToolResponse> {
        try {
            const absolutePath = path.resolve(cwd, dirPath);
            const files = await this.listFilesRecursive(absolutePath, recursive === 'true');
            return this.formatFilesList(absolutePath, files);
        } catch (error) {
            return this.formatToolError(`Error listing files: ${(error as Error).message}`);
        }
    }

    private async listFilesRecursive(dir: string, recursive: boolean): Promise<string[]> {
        const dirents = await fs.readdir(dir, { withFileTypes: true });
        const files = await Promise.all(dirents.map((dirent) => {
            const res = path.resolve(dir, dirent.name);
            if (dirent.isDirectory()) {
                return recursive ? this.listFilesRecursive(res, recursive) : [`${res}/`];
            } else {
                return res;
            }
        }));
        return files.flat();
    }

    private formatFilesList(absolutePath: string, files: string[]): string {
        const sorted = files
            .map(file => path.relative(absolutePath, file))
            .sort((a, b) => {
                const aParts = a.split(path.sep);
                const bParts = b.split(path.sep);
                for (let i = 0; i < Math.min(aParts.length, bParts.length); i++) {
                    if (aParts[i] !== bParts[i]) {
                        if (i + 1 === aParts.length && i + 1 < bParts.length) return -1;
                        if (i + 1 === bParts.length && i + 1 < aParts.length) return 1;
                        return aParts[i].localeCompare(bParts[i], undefined, { numeric: true, sensitivity: 'base' });
                    }
                }
                return aParts.length - bParts.length;
            });

        if (sorted.length === 0 || (sorted.length === 1 && sorted[0] === "")) {
            return "No files found or you do not have permission to view this directory.";
        } else if (sorted.length > LIST_FILES_LIMIT) {
            const truncatedList = sorted.slice(0, LIST_FILES_LIMIT).join("\n");
            return `${truncatedList}\n\n(Truncated at ${LIST_FILES_LIMIT} results. Try listing files in subdirectories if you need to explore further.)`;
        } else {
            return sorted.join("\n");
        }
    }

    private async listCodeDefinitionNames(dirPath: string): Promise<ToolResponse> {
        try {
            const absolutePath = path.resolve(cwd, dirPath);
            const files = await this.listFilesRecursive(absolutePath, true);
            const codeFiles = files.filter(file => ['.js', '.ts', '.py', '.java', '.cpp', '.c', '.cs'].includes(path.extname(file)));
            
            let definitions = '';
            for (const file of codeFiles) {
                const content = await fs.readFile(file, 'utf-8');
                const fileDefinitions = this.extractDefinitions(content, path.extname(file));
                if (fileDefinitions) {
                    definitions += `File: ${path.relative(absolutePath, file)}\n${fileDefinitions}\n\n`;
                }
            }
            
            return definitions || "No code definitions found.";
        } catch (error) {
            return this.formatToolError(`Error listing code definitions: ${(error as Error).message}`);
        }
    }

    private extractDefinitions(content: string, fileExtension: string): string {
        const definitionRegexes: { [key: string]: RegExp } = {
            '.js': /(?:class|function)\s+(\w+)/g,
            '.ts': /(?:class|function|interface)\s+(\w+)/g,
            '.py': /(?:class|def)\s+(\w+)/g,
            '.java': /(?:class|interface|enum)\s+(\w+)/g,
            '.cpp': /(?:class|struct|enum)\s+(\w+)/g,
            '.c': /(?:struct|enum)\s+(\w+)/g,
            '.cs': /(?:class|interface|struct|enum)\s+(\w+)/g,
        };

        const regex = definitionRegexes[fileExtension];
        if (!regex) return '';

        const matches = content.match(regex);
        return matches ? matches.join('\n') : '';
    }

    private async searchFiles(dirPath: string, regex: string, filePattern?: string): Promise<ToolResponse> {
        try {
            const absolutePath = path.resolve(cwd, dirPath);
            const files = await this.listFilesRecursive(absolutePath, true);
            const filteredFiles = filePattern
                ? files.filter(file => this.matchGlobPattern(file, filePattern))
                : files;

            const searchRegex = new RegExp(regex, 'gm');
            let results = '';

            for (const file of filteredFiles) {
                const content = await fs.readFile(file, 'utf-8');
                const matches = Array.from(content.matchAll(searchRegex));
                if (matches.length > 0) {
                    results += `File: ${path.relative(absolutePath, file)}\n`;
                    for (const match of matches) {
                        const lineNumber = (content.substring(0, match.index).match(/\n/g) || []).length + 1;
                        const lines = content.split('\n');
                        const contextStart = Math.max(0, lineNumber - 3);
                        const contextEnd = Math.min(lines.length, lineNumber + 2);
                        const context = lines.slice(contextStart, contextEnd).join('\n');
                        results += `- Match at line ${lineNumber}:\n${context}\n\n`;
                    }
                    results += '\n';
                }
            }

            return results || "No matches found.";
        } catch (error) {
            return this.formatToolError(`Error searching files: ${(error as Error).message}`);
        }
    }

    private matchGlobPattern(filePath: string, pattern: string): boolean {
        const regexPattern = pattern
            .replace(/\./g, '\\.')
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.');
        const regex = new RegExp(`^${regexPattern}$`);
        return regex.test(path.basename(filePath));
    }

    private async readFile(filePath: string): Promise<ToolResponse> {
        try {
            const absolutePath = path.resolve(cwd, filePath);
            const content: string = await fs.readFile(absolutePath, 'utf-8');
            return content;
        } catch (error) {
            return this.formatToolError(`Error reading file: ${(error as Error).message}`);
        }
    }

    private async writeToFile(filePath: string, newContent: string): Promise<ToolResponse> {
        try {
            const absolutePath = path.resolve(cwd, filePath);
            const fileExists = await fs.access(absolutePath).then(() => true).catch(() => false);
            
            if (fileExists) {
                const originalContent = await fs.readFile(absolutePath, 'utf-8');
                const diffResult = this.createPrettyPatch(filePath, originalContent, newContent);
                await fs.writeFile(absolutePath, newContent, 'utf-8');
                return `File updated successfully. Changes:\n\n${diffResult}`;
            } else {
                await fs.mkdir(path.dirname(absolutePath), { recursive: true });
                await fs.writeFile(absolutePath, newContent, 'utf-8');
                return `New file created successfully at ${this.getReadablePath(filePath)}`;
            }
        } catch (error) {
            return this.formatToolError(`Error writing to file: ${(error as Error).message}`);
        }
    }

    private createPrettyPatch(filename: string, oldStr: string, newStr: string): string {
        const patch = diff.createPatch(filename, oldStr, newStr);
        const lines = patch.split("\n");
        const prettyPatchLines = lines.slice(4);
        return prettyPatchLines.join("\n");
    }

    private getReadablePath(relPath: string): string {
        const absolutePath = path.resolve(cwd, relPath);
        if (cwd === path.join(os.homedir(), "Desktop")) {
            return absolutePath;
        }
        if (path.normalize(absolutePath) === path.normalize(cwd)) {
            return path.basename(absolutePath);
        } else {
            const normalizedRelPath = path.relative(cwd, absolutePath);
            if (absolutePath.includes(cwd)) {
                return normalizedRelPath;
            } else {
                return absolutePath;
            }
        }
    }

    private async askFollowupQuestion(question: string): Promise<ToolResponse> {
        // In a real implementation, this would interact with the user interface
        return `Follow-up question asked: ${question}`;
    }

    private async attemptCompletion(result: string, command?: string): Promise<ToolResponse> {
        let response = `Completion attempted with result: ${result}`;
        if (command) {
            response += `\nCommand to be executed: ${command}`;
        }
        return response;
    }

    protected async formatToolResult(result: string): Promise<string> {
        return result;
    }

    protected async formatToolError(error: string): Promise<string> {
        return `The tool execution failed with the following error:\n<e>\n${error}\n</e>`;
    }

    protected async formatToolDenied(): Promise<string> {
        return `The user denied this operation.`;
    }

    protected async formatToolDeniedFeedback(feedback: string): Promise<string> {
        return `The user denied this operation and provided the following feedback:\n<feedback>\n${feedback}\n</feedback>`;
    }
}
