import React from 'react';
import { Card, Progress, Space, Alert } from 'antd';
import { Line } from '@ant-design/charts';
import { formatFileSize } from '../utils/fileUtils';
import { getAlgorithmDisplayName } from '../constants/algorithms';

export const CompressionProgress = ({
  isCompressing,
  algorithm,
  uploadProgress,
  compressionProgress,
  compressionDetails,
  compressionTaskId,
  ws,
  compressionStartTime,
  progressData,
  compressionSpeedData,
}) => {
  if (!isCompressing) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Alert
          message="压缩进行中"
          description={
            <div>
              <p>正在使用 {getAlgorithmDisplayName(algorithm)} 压缩文件</p>
              <p>WebSocket连接状态: {ws && ws.readyState === WebSocket.OPEN ? '已连接' : '未连接'}</p>
              <p>任务ID: {compressionTaskId}</p>
              <p>开始时间: {compressionStartTime ? new Date(compressionStartTime).toLocaleTimeString() : '未开始'}</p>
              <p>已用时间: {compressionDetails.timeElapsed ? compressionDetails.timeElapsed.toFixed(2) : '0.00'}秒</p>
            </div>
          }
          type="info"
          showIcon
        />

        <div>
          <div style={{ marginBottom: 8 }}>上传进度：</div>
          <Progress percent={uploadProgress} status="active" />
        </div>

        <div>
          <div style={{ marginBottom: 8 }}>压缩进度：</div>
          <Progress percent={compressionProgress} status="active" format={percent => `${percent}%`} />
        </div>

        {/* 压缩过程中的实时图表 */}
        {(compressionProgress > 0 || progressData.length > 0) && (
          <div style={{ marginTop: 16 }}>
            <h5>实时压缩分析</h5>
            
            {/* 动态数字展示 */}
            <Card size="small" style={{ marginBottom: 16 }}>
              <Space size="large" style={{ width: '100%', justifyContent: 'space-around' }}>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 'bold' }}>原始大小</div>
                  <div style={{ fontSize: '20px', color: '#1890ff' }}>
                    {formatFileSize(compressionDetails.originalSize)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 'bold' }}>当前大小</div>
                  <div style={{ fontSize: '20px', color: '#52c41a' }}>
                    {formatFileSize(compressionDetails.compressedSize)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 'bold' }}>压缩率</div>
                  <div style={{ fontSize: '20px', color: '#faad14' }}>
                    {compressionDetails.compressionRatio ? compressionDetails.compressionRatio.toFixed(2) : '0.00'}%
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 'bold' }}>已用时间</div>
                  <div style={{ fontSize: '20px', color: '#722ed1' }}>
                    {compressionDetails.timeElapsed ? compressionDetails.timeElapsed.toFixed(2) : '0.00'}秒
                  </div>
                </div>
              </Space>
            </Card>

            <Space direction="vertical" style={{ width: '100%' }}>
              {/* 压缩进度时间线 */}
              {progressData.length > 0 && (
                <Card title="压缩进度时间线" size="small">
                  <Line
                    data={progressData}
                    xField="time"
                    yField="progress"
                    xAxis={{
                      title: { text: '时间 (秒)' },
                      min: progressData.length > 0 ? Math.max(0, parseFloat(progressData[progressData.length - 1].time) - 30) : 0,
                      max: progressData.length > 0 ? parseFloat(progressData[progressData.length - 1].time) : 0,
                    }}
                    yAxis={{
                      title: { text: '进度 (%)' },
                      min: 0,
                      max: 100,
                    }}
                    point={{
                      size: 2,
                      shape: 'circle',
                    }}
                    tooltip={{
                      formatter: (datum) => {
                        return { name: '进度', value: datum.progress + '%' };
                      },
                    }}
                    height={200}
                  />
                </Card>
              )}

              {/* 压缩速度折线图 */}
              {compressionSpeedData.length > 0 && (
                <Card title="压缩速度变化" size="small">
                  <Line
                    data={compressionSpeedData}
                    xField="time"
                    yField="speed"
                    xAxis={{
                      title: { text: '时间 (秒)' },
                      min: compressionSpeedData.length > 0 ? Math.max(0, parseFloat(compressionSpeedData[compressionSpeedData.length - 1].time) - 30) : 0,
                      max: compressionSpeedData.length > 0 ? parseFloat(compressionSpeedData[compressionSpeedData.length - 1].time) : 0,
                    }}
                    yAxis={{
                      title: { text: '速度 (字节/秒)' },
                    }}
                    point={{
                      size: 2,
                      shape: 'circle',
                    }}
                    tooltip={{
                      formatter: (datum) => {
                        return { name: '速度', value: formatFileSize(datum.speed) + '/秒' };
                      },
                    }}
                    height={200}
                  />
                </Card>
              )}
            </Space>
          </div>
        )}
      </Space>
    </div>
  );
}; 