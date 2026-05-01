"""CLI命令行工具"""
import asyncio
import click
from pathlib import Path

from app.services.asr_service import asr_service
from app.services.llm_service import llm_service
from app.services.storage_service import storage_service
from app.config import get_config, save_config


@click.group()
def cli():
    """课程录音转文字+AI智能总结 CLI工具"""
    pass


@cli.command()
@click.argument('file_path', type=click.Path(exists=True))
@click.option('--summary/--no-summary', default=False, help='是否生成AI总结')
@click.option('--output', '-o', type=click.Path(), help='输出文件路径')
def transcribe(file_path, summary, output):
    """转写音频文件"""
    click.echo(f"正在转写: {file_path}")
    
    async def _transcribe():
        # 执行转写
        full_text = ""
        async for delta in asr_service.transcribe_file(file_path):
            if delta:
                full_text += delta
                click.echo(delta, nl=False)
        click.echo()  # 换行
        
        # 保存记录
        filename = Path(file_path).name
        record = storage_service.create_record(filename, full_text)
        click.echo(f"\n转写完成! 记录ID: {record.id}")
        
        # 生成总结
        if summary:
            click.echo("\n正在生成AI总结...")
            result = await llm_service.generate_summary(full_text)
            
            # 更新记录
            storage_service.update_record(
                record.id,
                summary=result["summary"],
                key_points=result["key_points"]
            )
            
            click.echo("\n" + "=" * 50)
            click.echo(result["summary"])
        
        # 输出到文件
        if output:
            content = f"转写内容:\n{full_text}\n"
            if summary:
                content += f"\n{'=' * 50}\nAI总结:\n{result['summary']}\n"
            
            with open(output, 'w', encoding='utf-8') as f:
                f.write(content)
            click.echo(f"\n已保存到: {output}")
    
    asyncio.run(_transcribe())


@cli.command()
@click.argument('text')
@click.option('--output', '-o', type=click.Path(), help='输出文件路径')
def summarize(text, output):
    """生成文本总结"""
    click.echo("正在生成AI总结...")
    
    async def _summarize():
        result = await llm_service.generate_summary(text)
        click.echo("\n" + "=" * 50)
        click.echo(result["summary"])
        
        if output:
            with open(output, 'w', encoding='utf-8') as f:
                f.write(result["summary"])
            click.echo(f"\n已保存到: {output}")
    
    asyncio.run(_summarize())


@cli.command()
@click.option('--keyword', '-k', help='搜索关键词')
@click.option('--limit', '-l', default=10, help='显示数量')
def history(keyword, limit):
    """查看历史记录"""
    result = storage_service.list_records(keyword, page_size=limit)
    
    if result.total == 0:
        click.echo("暂无记录")
        return
    
    click.echo(f"共 {result.total} 条记录:\n")
    for record in result.records:
        click.echo(f"ID: {record.id}")
        click.echo(f"文件: {record.filename}")
        click.echo(f"时间: {record.created_at}")
        click.echo(f"内容: {record.transcription[:100]}...")
        if record.summary:
            click.echo("已有AI总结")
        click.echo("-" * 40)


@cli.command()
@click.argument('record_id')
def show(record_id):
    """查看记录详情"""
    record = storage_service.get_record(record_id)
    if not record:
        click.echo("记录不存在")
        return
    
    click.echo(f"文件: {record.filename}")
    click.echo(f"时间: {record.created_at}")
    click.echo(f"\n转写内容:\n{record.transcription}")
    
    if record.summary:
        click.echo(f"\n{'=' * 50}")
        click.echo(f"AI总结:\n{record.summary}")


@cli.command()
@click.argument('record_id')
def export(record_id):
    """导出记录"""
    content = storage_service.export_record(record_id)
    if not content:
        click.echo("记录不存在")
        return
    
    output_file = f"record_{record_id}.txt"
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(content)
    click.echo(f"已导出到: {output_file}")


@cli.command()
@click.option('--host', '-h', default='0.0.0.0', help='监听地址')
@click.option('--port', '-p', default=8000, help='监听端口')
def serve(host, port):
    """启动Web服务"""
    import uvicorn
    click.echo(f"启动Web服务: http://{host}:{port}")
    click.echo(f"API文档: http://{host}:{port}/docs")
    uvicorn.run("app.main:app", host=host, port=port, reload=True)


@cli.group()
def config():
    """配置管理"""
    pass


@config.command('show')
def config_show():
    """显示当前配置"""
    cfg = get_config()
    
    def mask_key(key: str) -> str:
        if not key:
            return "未配置"
        if len(key) <= 12:
            return "****"
        return key[:8] + "****" + key[-4:]
    
    click.echo("当前配置:")
    click.echo(f"  阶跃星辰 API Key: {mask_key(cfg['step_api_key'])}")
    click.echo(f"  AI模型 API Key:    {mask_key(cfg['llm_api_key'])}")
    click.echo(f"  AI模型 Base URL:   {cfg['llm_base_url']}")
    click.echo(f"  AI模型名称:        {cfg['llm_model']}")


@config.command('set')
@click.option('--step-key', help='设置阶跃星辰 API Key')
@click.option('--llm-key', help='设置AI模型 API Key')
@click.option('--llm-url', help='设置AI模型 Base URL')
@click.option('--llm-model', help='设置AI模型名称')
def config_set(step_key, llm_key, llm_url, llm_model):
    """设置配置项"""
    cfg = get_config()
    
    if step_key:
        cfg['step_api_key'] = step_key
        click.echo("✓ 阶跃星辰 API Key 已更新")
    
    if llm_key:
        cfg['llm_api_key'] = llm_key
        click.echo("✓ AI模型 API Key 已更新")
    
    if llm_url:
        cfg['llm_base_url'] = llm_url
        click.echo("✓ AI模型 Base URL 已更新")
    
    if llm_model:
        cfg['llm_model'] = llm_model
        click.echo("✓ AI模型名称 已更新")
    
    save_config(cfg)
    click.echo("\n配置已保存!")


@config.command('setup')
def config_setup():
    """交互式配置向导"""
    click.echo("=== 配置向导 ===\n")
    
    cfg = get_config()
    
    # 阶跃星辰 API Key
    click.echo("1. 阶跃星辰 API Key (用于ASR语音识别)")
    click.echo("   获取地址: https://platform.stepfun.com")
    step_key = click.prompt("   请输入API Key", default=cfg.get('step_api_key', ''), show_default=False)
    if step_key:
        cfg['step_api_key'] = step_key
    
    # AI模型配置
    click.echo("\n2. AI模型配置 (OpenAI兼容接口)")
    click.echo("   支持: DeepSeek / 小米MiMo 等")
    
    llm_key = click.prompt("   请输入API Key", default=cfg.get('llm_api_key', ''), show_default=False)
    if llm_key:
        cfg['llm_api_key'] = llm_key
    
    llm_url = click.prompt("   请输入Base URL", default=cfg.get('llm_base_url', 'https://api.deepseek.com'))
    cfg['llm_base_url'] = llm_url
    
    llm_model = click.prompt("   请输入模型名称", default=cfg.get('llm_model', 'deepseek-v4-flash'))
    cfg['llm_model'] = llm_model
    
    save_config(cfg)
    
    click.echo("\n✓ 配置已保存!")
    click.echo("\n现在可以使用以下命令:")
    click.echo("  python cli.py serve          # 启动Web服务")
    click.echo("  python cli.py transcribe xxx  # 转写音频")


if __name__ == '__main__':
    cli()
