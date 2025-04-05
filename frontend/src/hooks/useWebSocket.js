import { useState, useEffect, useCallback } from 'react';

export const useWebSocket = () => {
  const [ws, setWs] = useState(null);
  const [isWsConnecting, setIsWsConnecting] = useState(false);

  const connectWebSocket = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (ws) {
        ws.close();
      }

      setIsWsConnecting(true);
      const newWs = new WebSocket('ws://localhost:8000/ws/compression');
      let connectionTimeout = null;

      // 设置连接超时
      connectionTimeout = setTimeout(() => {
        if (newWs.readyState !== WebSocket.OPEN) {
          newWs.close();
          setIsWsConnecting(false);
          reject(new Error('WebSocket连接超时'));
        }
      }, 5000);

      newWs.onopen = () => {
        console.log('WebSocket连接已建立');
        clearTimeout(connectionTimeout);
        setIsWsConnecting(false);
        resolve(newWs);
      };

      newWs.onerror = (error) => {
        console.error('WebSocket错误:', error);
        clearTimeout(connectionTimeout);
        setIsWsConnecting(false);
        reject(error);
      };

      newWs.onclose = () => {
        console.log('WebSocket连接已关闭');
        clearTimeout(connectionTimeout);
        setIsWsConnecting(false);
      };

      setWs(newWs);
    });
  }, [ws]);

  const closeWebSocket = useCallback(() => {
    if (ws) {
      ws.close();
      setWs(null);
    }
  }, [ws]);

  useEffect(() => {
    return () => {
      closeWebSocket();
    };
  }, [closeWebSocket]);

  return {
    ws,
    isWsConnecting,
    connectWebSocket,
    closeWebSocket
  };
}; 