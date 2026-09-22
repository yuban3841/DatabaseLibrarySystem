import { useCallback, useEffect, useMemo, useState } from 'react';
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import { App, Button, Card, Col, Progress, Row, Space, Spin, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { EChartsOption } from 'echarts';
import dayjs from 'dayjs';
import { ApiError, statisticsApi } from '../api';
import EChart from '../components/EChart';
import type { ActivityComparisonRow } from '../types';
import { exportExcelTable } from '../utils/download';

export default function Statistics() {
  const { message } = App.useApp();
  const [rows, setRows] = useState<ActivityComparisonRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await statisticsApi.comparison());
    } catch (error) {
      message.error(error instanceof ApiError ? error.message : '加载统计数据失败');
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const volumeOption = useMemo<EChartsOption | null>(() => {
    if (!rows.length) return null;
    return {
      tooltip: { trigger: 'axis' },
      legend: { top: 0 },
      grid: { left: 48, right: 24, top: 44, bottom: 68 },
      xAxis: {
        type: 'category',
        data: rows.map((r) => r.title),
        axisLabel: { interval: 0, rotate: 18, width: 90, overflow: 'truncate' },
      },
      yAxis: { type: 'value', minInterval: 1 },
      series: [
        { name: '报名人数', type: 'bar', data: rows.map((r) => r.enrolled) },
        { name: '通过', type: 'bar', data: rows.map((r) => r.approved) },
        { name: '已签到', type: 'bar', data: rows.map((r) => r.checkedIn) },
      ],
    };
  }, [rows]);

  const rateOption = useMemo<EChartsOption | null>(() => {
    if (!rows.length) return null;
    return {
      tooltip: { trigger: 'axis', valueFormatter: (value) => `${value}%` },
      grid: { left: 48, right: 24, top: 24, bottom: 68 },
      xAxis: {
        type: 'category',
        data: rows.map((r) => r.title),
        axisLabel: { interval: 0, rotate: 18, width: 90, overflow: 'truncate' },
      },
      yAxis: { type: 'value', max: 100, axisLabel: { formatter: '{value}%' } },
      series: [
        {
          name: '签到率',
          type: 'bar',
          data: rows.map((r) => r.checkinRate),
          itemStyle: { borderRadius: [4, 4, 0, 0] },
          label: { show: true, position: 'top', formatter: '{c}%' },
          markLine: {
            symbol: 'none',
            data: [{ yAxis: 80, label: { formatter: '目标 80%' } }],
          },
        },
      ],
    };
  }, [rows]);

  const handleExport = () => {
    if (!rows.length) {
      message.warning('暂无数据可导出');
      return;
    }
    const stamp = dayjs().format('YYYYMMDDHHmmss');
    exportExcelTable(
      `ClubCue_活动统计_${stamp}`,
      ['活动ID', '活动名称', '分类', '名额', '报名人数', '通过', '驳回', '候补', '取消', '已签到', '签到率(%)', '开始时间'],
      rows.map((r) => [
        r.activityId,
        r.title,
        r.category,
        r.capacity,
        r.enrolled,
        r.approved,
        r.rejected,
        r.waiting,
        r.cancelled,
        r.checkedIn,
        r.checkinRate,
        r.startTime,
      ])
    );
    message.success(`已导出 ${rows.length} 个活动统计`);
  };

  const columns: ColumnsType<ActivityComparisonRow> = [
    { title: '活动名称', dataIndex: 'title', width: 220, fixed: 'left', ellipsis: true },
    { title: '分类', dataIndex: 'category', width: 80, render: (value) => <Tag>{value}</Tag> },
    { title: '名额', dataIndex: 'capacity', width: 80, align: 'right' },
    { title: '报名', dataIndex: 'enrolled', width: 80, align: 'right' },
    { title: '通过', dataIndex: 'approved', width: 80, align: 'right' },
    { title: '驳回', dataIndex: 'rejected', width: 80, align: 'right' },
    { title: '候补', dataIndex: 'waiting', width: 80, align: 'right' },
    { title: '取消', dataIndex: 'cancelled', width: 80, align: 'right' },
    { title: '已签到', dataIndex: 'checkedIn', width: 90, align: 'right' },
    {
      title: '签到率',
      dataIndex: 'checkinRate',
      width: 190,
      render: (rate: number, record) => (
        <Space size="small">
          <Progress
            percent={rate}
            size="small"
            style={{ width: 110, margin: 0 }}
            status={rate >= 80 ? 'success' : undefined}
            showInfo={false}
          />
          <span style={rate >= 80 ? { color: '#3f8600' } : { color: '#cf7a00' }}>{rate}%</span>
          <span style={{ color: '#bbb', fontSize: 12 }}>
            {record.checkedIn}/{record.approved}
          </span>
        </Space>
      ),
    },
    { title: '开始时间', dataIndex: 'startTime', width: 170 },
  ];

  if (loading && !rows.length) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 120 }}>
        <Spin size="large" tip="加载统计数据…" />
      </div>
    );
  }

  return (
    <div>
      <div className="cc-toolbar">
        <span style={{ color: '#888' }}>统计口径：报名数含候补与已取消；签到率 = 已签到 ÷ 通过人数</span>
        <span className="spacer" />
        <Button icon={<ReloadOutlined />} onClick={() => void fetchAll()}>
          刷新
        </Button>
        <Button type="primary" icon={<DownloadOutlined />} onClick={handleExport}>
          导出 Excel
        </Button>
      </div>

      <Card title="报名人数对比">
        {volumeOption ? <EChart option={volumeOption} height={340} /> : <EmptyText />}
      </Card>

      <Card title="签到率对比" style={{ marginTop: 16 }}>
        {rateOption ? <EChart option={rateOption} height={320} /> : <EmptyText />}
      </Card>

      <Card title="活动统计明细" style={{ marginTop: 16 }}>
        <Table
          rowKey="activityId"
          columns={columns}
          dataSource={rows}
          pagination={false}
          scroll={{ x: 1200 }}
          summary={(data) => {
            const sum = (key: keyof ActivityComparisonRow) =>
              data.reduce((total, row) => total + Number(row[key] ?? 0), 0);
            const approvedTotal = sum('approved');
            const checkedTotal = sum('checkedIn');
            const appliedTotal = sum('enrolled');
            return (
              <Table.Summary fixed>
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0}>合计 / 平均</Table.Summary.Cell>
                  <Table.Summary.Cell index={1} />
                  <Table.Summary.Cell index={2} align="right">{sum('capacity')}</Table.Summary.Cell>
                  <Table.Summary.Cell index={3} align="right">{appliedTotal}</Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="right">{approvedTotal}</Table.Summary.Cell>
                  <Table.Summary.Cell index={5} align="right">{sum('rejected')}</Table.Summary.Cell>
                  <Table.Summary.Cell index={6} align="right">{sum('waiting')}</Table.Summary.Cell>
                  <Table.Summary.Cell index={7} align="right">{sum('cancelled')}</Table.Summary.Cell>
                  <Table.Summary.Cell index={8} align="right">{checkedTotal}</Table.Summary.Cell>
                  <Table.Summary.Cell index={9} align="right">
                    {approvedTotal ? Math.round((checkedTotal / approvedTotal) * 100) : 0}%
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={10} />
                </Table.Summary.Row>
              </Table.Summary>
            );
          }}
        />
      </Card>

      <Card title="看板口径" style={{ marginTop: 16 }}>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} md={8}>
            <KpiCard title="累计报名" value={rows.reduce((sum, r) => sum + r.enrolled, 0)} />
          </Col>
          <Col xs={24} sm={12} md={8}>
            <KpiCard title="累计通过" value={rows.reduce((sum, r) => sum + r.approved, 0)} />
          </Col>
          <Col xs={24} sm={12} md={8}>
            <KpiCard
              title="整体签到率"
              value={
                (() => {
                  const approved = rows.reduce((sum, r) => sum + r.approved, 0);
                  const checked = rows.reduce((sum, r) => sum + r.checkedIn, 0);
                  return approved ? `${Math.round((checked / approved) * 100)}%` : '0%';
                })()
              }
            />
          </Col>
        </Row>
      </Card>
    </div>
  );
}

function EmptyText() {
  return (
    <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>暂无统计数据</div>
  );
}

function KpiCard({ title, value }: { title: string; value: string | number }) {
  return (
    <Card size="small">
      <div style={{ color: '#888', fontSize: 13 }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: 600, marginTop: 4 }}>{value}</div>
    </Card>
  );
}
