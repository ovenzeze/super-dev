#!/bin/bash

# OpenHands CLI快捷指令

OPENHANDS_DIR="$HOME/OpenHands"
CONFIG_FILE="$OPENHANDS_DIR/config.toml"

# 打印环境变量和配置信息
print_info() {
    echo "OpenHands CLI 启动信息："
    echo "工作目录: $OPENHANDS_DIR"
    echo "配置文件: $CONFIG_FILE"
    
    echo "环境变量："
    echo "OPENAI_API_KEY=${OPENAI_API_KEY:-(未设置)}"
    echo "ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-(未设置)}"
    echo "OPENHANDS_MODEL=${OPENHANDS_MODEL:-(未设置)}"
    echo "OPENHANDS_PROVIDER=${OPENHANDS_PROVIDER:-(未设置)}"
    
    if [ -f "$CONFIG_FILE" ]; then
        echo "配置文件内容:"
        grep -E "provider|model|api_key" "$CONFIG_FILE" | sed 's/api_key.*/api_key = "********"/'
    else
        echo "警告: 未找到配置文件 $CONFIG_FILE"
    fi
    
    echo "配置文件模板参考: https://github.com/All-Hands-AI/OpenHands/blob/main/config.template.toml"
    echo "----------------------------------------"
}

# 检查并安装依赖
install_dependencies() {
    # 检查并安装Python 3.12
    if ! command -v python3.12 &> /dev/null; then
        echo "正在安装Python 3.12..."
        if [[ "$OSTYPE" == "darwin"* ]]; then
            brew install python@3.12
        elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
            sudo add-apt-repository ppa:deadsnakes/ppa
            sudo apt-get update
            sudo apt-get install python3.12
        else
            echo "无法自动安装Python 3.12。请手动安装后重试。"
            exit 1
        fi
    fi

    # 检查并安装Poetry
    if ! command -v poetry &> /dev/null; then
        echo "正在安装Poetry..."
        curl -sSL https://install.python-poetry.org | python3 -
    fi
}

# 设置OpenHands环境
setup_openhands() {
    if [ ! -d "$OPENHANDS_DIR" ]; then
        echo "正在设置OpenHands环境..."
        git clone https://github.com/All-Hands-AI/OpenHands.git "$OPENHANDS_DIR"
        cd "$OPENHANDS_DIR"
        poetry install
    else
        cd "$OPENHANDS_DIR"
        git pull
        poetry install
    fi
}

# 检查配置
check_config() {
    if [ ! -f "$CONFIG_FILE" ]; then
        echo "警告: 未找到config.toml文件。"
        echo "是否要创建一个基本的config.toml文件？ (y/n)"
        read answer
        if [[ $answer =~ ^[Yy]$ ]]; then
            echo '[llm]
provider = "openai"
model = "gpt-3.5-turbo"

[openai]
api_key = "YOUR_API_KEY_HERE"' > "$CONFIG_FILE"
            echo "已创建基本的config.toml文件。"
            
            echo "是否要使用VSCode编辑config.toml文件？ (y/n)"
            read use_vscode
            if [[ $use_vscode =~ ^[Yy]$ ]]; then
                if command -v code &> /dev/null; then
                    code "$CONFIG_FILE"
                else
                    echo "未找到VSCode命令行工具。请手动编辑 $CONFIG_FILE 文件。"
                fi
            else
                echo "请手动编辑 $CONFIG_FILE 文件并设置正确的API密钥。"
            fi
        else
            echo "请确保在运行CLI之前设置正确的环境变量或创建config.toml文件。"
        fi
    fi
}

# 运行OpenHands CLI
run_openhands_cli() {
    echo "正在启动OpenHands CLI模式..."
    print_info
    cd "$OPENHANDS_DIR"
    poetry run python -m openhands.core.cli
    
    if [ $? -ne 0 ]; then
        echo "运行OpenHands CLI失败。请检查错误信息。"
        echo "调试提示: 确保您已正确设置模型、API密钥和其他设置。"
        echo "详细信息请参考: https://github.com/All-Hands-AI/OpenHands/blob/main/DEVELOPMENT.md"
        exit 1
    fi
}

# 主函数
main() {
    install_dependencies
    setup_openhands
    check_config
    run_openhands_cli
}

# 运行主函数
main
