// test/ToolManager.test.ts
import { expect, describe, it, beforeAll } from 'vitest';
import { ToolManager, Tool } from '../plugins/ToolManager';

describe('ToolManager Tests', () => {
  let toolManager: ToolManager;

  beforeAll(() => {
    toolManager = new ToolManager();

    // 注册需要测试的工具
    const executeCommandTool: Tool = {
      name: 'execute_command',
      description: 'Execute a system command',
      input_schema: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The command to execute',
          },
        },
        required: ['command'],
      },
    };

    const readFileTool: Tool = {
      name: 'read_file',
      description: 'Read content from a file',
      input_schema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The path of the file to read',
          },
        },
        required: ['path'],
      },
    };

    toolManager.registerTool(executeCommandTool);
    toolManager.registerTool(readFileTool);

    // 可以继续注册其他工具...
  });

  it('should execute a system command', async () => {
    const result = await toolManager.executeTool('execute_command', { command: 'echo "Hello, World!"' });
    expect(result).toContain('Hello, World!');
  });

  it('should read content from a file', async () => {
    // 假设项目根目录下有一个 package.json 文件
    const result = await toolManager.executeTool('read_file', { path: 'package.json' });
    expect(result).toBeTypeOf('string');
    expect(result).toContain('"name":');
  });

  // 更多测试用例...
});
