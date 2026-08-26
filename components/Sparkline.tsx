/** Weekly new-lead counts as a bar strip. Server-rendered, no chart library. */
export function Sparkline({ data }: { data: { week: string; count: number }[] }) {
  if (data.length === 0) {
    return <div className="faint small">No leads recorded yet.</div>;
  }

  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <>
      <div className="spark">
        {data.map((d, i) => (
          <div className="spark-col" key={d.week} title={`${d.week}: ${d.count} new`}>
            <div
              className="spark-bar"
              style={{
                height: `${Math.max(4, (d.count / max) * 100)}%`,
                animationDelay: `${i * 0.035}s`,
              }}
            />
          </div>
        ))}
      </div>
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
        <span className="spark-label">{data[0].week}</span>
        <span className="spark-label">peak {max}</span>
        <span className="spark-label">{data[data.length - 1].week}</span>
      </div>
    </>
  );
}
