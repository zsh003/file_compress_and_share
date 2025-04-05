import React, { useState, useEffect } from 'react';
import { Alert, Progress, Card, Row, Col, Statistic } from 'antd';
import { Line } from '@ant-design/plots';
import { formatFileSize } from '../utils/fileUtils';
import { getAlgorithmDisplayName } from '../constants/algorithms';

export const CompressionProgress = ({
  isCompressing,
  algorithm,
  uploadProgress,
  compressionProgress,
  compressionDetails,
  compressionTaskId,
  compressionStartTime,
  progressData,
  compressionSpeedData
}) => {
  const [displayedProgressData, setDisplayedProgressData] = useState([]);
  const [displayedSpeedData, setDisplayedSpeedData] = useState([]);
  const WINDOW_SIZE = 100; // 显示最近100个数据点

  useEffect(() => {
    if (compressionProgress === 100) {
      // 压缩完成时显示所有数据
      setDisplayedProgressData(progressData);
      setDisplayedSpeedData(compressionSpeedData);
    } else {
      // 压缩过程中只显示最近的数据点
      setDisplayedProgressData(progressData.slice(-WINDOW_SIZE));
      setDisplayedSpeedData(compressionSpeedData.slice(-WINDOW_SIZE));
    }
  }, [progressData, compressionSpeedData, compressionProgress]);

  const getAlertType = () => {
    if (!compressionDetails.wsConnected) return 'warning';
    if (compressionProgress === 100) return 'success';
    return 'info';
  };

  const getAlertMessage = () => {
    if (!compressionDetails.wsConnected) {
      return '正在建立WebSocket连接...';
    }
    if (compressionProgress === 100) {
      return '压缩完成！';
    }
    return `正在使用 ${algorithm} 算法压缩文件`;
  };

  const formatSize = (size) => {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`;
    return `${(size / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatSpeed = (speed) => {
    if (!speed) return '0 B/s';
    if (speed < 1024) return `${speed.toFixed(2)} B/s`;
    if (speed < 1024 * 1024) return `${(speed / 1024).toFixed(2)} KB/s`;
    return `${(speed / (1024 * 1024)).toFixed(2)} MB/s`;
  };

  const getElapsedTime = () => {
    if (!compressionStartTime) return '0秒';
    const elapsed = Math.floor((Date.now() - compressionStartTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    return minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`;
  };

  return (
    <div style={{ marginTop: 20 }}>
      <Alert
        type={getAlertType()}
        message={getAlertMessage()}
        description={
          <div>
            <p>WebSocket连接状态: {compressionDetails.wsConnected ? '已连接' : '未连接'}</p>
            <p>任务ID: {compressionTaskId}</p>
            <p>开始时间: {new Date(compressionStartTime).toLocaleString()}</p>
            <p>已用时间: {getElapsedTime()}</p>
          </div>
        }
      />

      <Card title="上传进度" style={{ marginTop: 16 }}>
        <Progress percent={uploadProgress} status={uploadProgress === 100 ? "success" : "active"} />
      </Card>

      <Card title="压缩进度" style={{ marginTop: 16 }}>
        <Progress percent={compressionProgress} status={compressionProgress === 100 ? "success" : "active"} />
      </Card>

      <Card title="实时分析" style={{ marginTop: 16 }}>
        <Row gutter={16}>
          <Col span={6}>
            <Statistic
              title="原始大小"
              value={formatSize(compressionDetails.original_size || 0)}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="当前大小"
              value={formatSize(compressionDetails.current_size || 0)}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="压缩比"
              value={compressionDetails.original_size ? 
                `${((1 - (compressionDetails.current_size || 0) / compressionDetails.original_size) * 100).toFixed(2)}%` 
                : '0%'}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="压缩速度"
              value={formatSpeed(compressionDetails.speed || 0)}
            />
          </Col>
        </Row>
      </Card>

      {displayedProgressData.length > 0 && (
        <Card title="压缩进度图表" style={{ marginTop: 16 }}>
          <Line
            data={displayedProgressData}
            xField="time"
            yField="progress"
            xAxis={{
              title: { text: '时间 (秒)' }
            }}
            yAxis={{
              title: { text: '进度 (%)' },
              min: 0,
              max: 100
            }}
          />
        </Card>
      )}

      {displayedSpeedData.length > 0 && (
        <Card title="压缩速度图表" style={{ marginTop: 16 }}>
          <Line
            data={displayedSpeedData}
            xField="time"
            yField="speed"
            xAxis={{
              title: { text: '时间 (秒)' }
            }}
            yAxis={{
              title: { text: '速度 (B/s)' }
            }}
          />
        </Card>
      )}
    </div>
  );
}; 