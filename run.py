"""启动脚本"""
import uvicorn
from app.config import HOST, PORT

if __name__ == "__main__":
    print(f"启动课程录音转文字+AI智能总结服务...")
    print(f"访问地址: http://localhost:{PORT}")
    print(f"API文档: http://localhost:{PORT}/docs")
    uvicorn.run(
        "app.main:app",
        host=HOST,
        port=PORT,
        reload=True
    )
