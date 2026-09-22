import { useEffect, useMemo, useState } from 'react';
import {
  CalendarOutlined,
  ClockCircleOutlined,
  QrcodeOutlined,
  ScheduleOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { Card, Col, Progress, Row, Spin, Statistic, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { EChartsOption } from 'echarts';
import { statisticsApi } from '../api';
import EChart from '../components/EChart';
import type { DashboardStats } from '../types';

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        setStats(await statisticsApi.dashboard());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const trendOption = useMemo<EChartsOption | null>(() => {
    if (!stats) return null;
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 40, right: 24, top: 24, bottom: 32 },
      xAxis: { type: 'category', data: stats.registrationTrend.map((d) => d.date) },
      yAxis: { type: 'value', minInterval: 1 },
      series: [
        {
          name: '报名数',
          type: 'line',
          smooth: true,
          data: stats.registrationTrend.map((d) => d.count),
          areaStyle: { opacity: 0.18 },
        },
      ],
    };
  }, [stats]);

  const categoryOption = useMemo<EChartsOption | null>(() => {
    if (!stats) return null;
    return {
      tooltip: { trigger: 'item', formatter: '{b}：{c} 个（{d}%）' },
      legend: { bottom: 0 },
      series: [
        {
          type: 'pie',
          radius: ['42%', '66%'],
          data: stats.categoryDistribution.map((d) => ({ name: d.category, value: d.count })),
          label: { formatter: '{b}: {c}' },
        },
      ],
    };
  }, [stats]);

  if (loading || !stats) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 120 }}>
        <Spin size="large" tip="加载统计数据…" />
      </div>
    );
  }

  const hotColumns: ColumnsType<(typeof stats.hotActivities)[number]> = [
    { title: '活动', dataIndex: 'title', ellipsis: true },
    { title: '名额', dataIndex: 'capacity', width: 90, align: 'right' },
    {
      title: '报名进度',
      dataIndex: 'enrolled',
      width: 260,
      render: (enrolled: number, record) => <ProgressCell enrolled={enrolled} capacity={record.capacity} />,
    },
  ];

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={8} xl={4}>
          <Card>
            <Statistic title="活动总数" value={stats.activityCount} prefix={<CalendarOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8} xl={4}>
          <Card>
            <Statistic title="已发布" value={stats.publishedCount} prefix={<ScheduleOutlined />} valueStyle={{ color: '#3f8600' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8} xl={4}>
          <Card>
            <Statistic title="报名总数" value={stats.totalRegistration} prefix={<TeamOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8} xl={4}>
          <Card>
            <Statistic title="待审核" value={stats.pendingReview} prefix={<ClockCircleOutlined />} valueStyle={{ color: '#cf7a00' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8} xl={4}>
          <Card>
            <Statistic title="今日签到" value={stats.todayCheckin} prefix={<QrcodeOutlined />} valueStyle={{ color: '#1677ff' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8} xl={4}>
          <Card>
            <Statistic title="平均签到率" value={stats.avgCheckinRate} suffix="%" />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={14}>
          <Card title="近 7 天报名趋势">
            {trendOption ? <EChart option={trendOption} height={300} /> : null}
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="活动分类分布">
            {categoryOption ? <EChart option={categoryOption} height={300} /> : null}
          </Card>
        </Col>
      </Row>

      <Card title="热门活动 Top 5" style={{ marginTop: 16 }}>
        <Table rowKey="activityId" columns={hotColumns} dataSource={stats.hotActivities} pagination={false} size="middle" />
      </Card>
    </div>
  );
}

function ProgressCell({ enrolled, capacity }: { enrolled: number; capacity: number }) {
  const percent = capacity ? Math.min(100, Math.round((enrolled / capacity) * 100)) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Progress percent={percent} size="small" style={{ width: 160, margin: 0 }} />
      <span style={{ color: '#888', fontSize: 12 }}>
        {enrolled}/{capacity}
      </span>
    </div>
  );
}
