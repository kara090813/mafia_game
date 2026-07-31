import { useState } from 'react';

interface RuleModalProps {
  game: 'mafia' | 'avalon';
}

export function RuleButton({ game }: RuleModalProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className="btn-ghost btn-sm"
        style={{ width: 'auto', minWidth: 32, padding: '6px 10px', fontSize: 14, fontWeight: 700 }}
        onClick={() => setOpen(true)}
      >
        ?
      </button>

      {open && (
        <div className="overlay" onClick={() => setOpen(false)}>
          <div
            className="rule-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rule-modal-header">
              <h2 style={{ fontSize: 17, fontWeight: 700 }}>
                {game === 'mafia' ? '마피아 규칙' : '천사와 악마 규칙'}
              </h2>
              <button
                className="btn-ghost btn-sm"
                style={{ width: 'auto', padding: '4px 10px' }}
                onClick={() => setOpen(false)}
              >
                닫기
              </button>
            </div>
            <div className="rule-modal-body">
              {game === 'mafia' ? <MafiaRules /> : <AvalonRules />}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MafiaRules() {
  return (
    <div className="stack stack-16">
      <Section title="게임 흐름">
        <p>시민팀 vs 마피아팀. 7~12명.</p>
        <p>밤: 각 직업이 능력 사용 / 낮: 토론 후 투표로 처형</p>
        <p>시민팀은 마피아팀을 모두 제거하면 승리.</p>
        <p>마피아팀은 시민팀 이하로 줄이면 승리.</p>
        <p>사망자의 직업과 소속은 공개되지 않습니다.</p>
      </Section>

      <Section title="마피아팀">
        <Role name="마피아" color="var(--red)">
          밤마다 시민 1명을 처형합니다. 2명일 때는 마지막 확정된 선택이 적용됩니다. 접선한 스파이와 밤 전용 채팅이 가능합니다.
        </Role>
        <Role name="스파이" color="var(--red)">
          처음엔 마피아가 누구인지 모릅니다. 밤마다 1명에게 접선을 시도하며 마피아를 찾으면 서로 정체 확인 + 팀 채팅 참여. 첫날 밤 사망자의 직업을 확인합니다.
        </Role>
      </Section>

      <Section title="시민팀 - 필수">
        <Role name="경찰" color="var(--blue)">
          매일 밤 1명을 조사하여 시민팀/마피아팀 여부 확인. 정확한 직업은 알 수 없음. 자기 자신 조사 불가.
        </Role>
        <Role name="의사" color="var(--blue)">
          매일 밤 자신 포함 1명을 치료. 마피아 공격을 방어. 자기 치료는 게임당 2회까지. 자경단/투표/트릭은 방어 불가. 치료 성공 여부 미통보.
        </Role>
      </Section>

      <Section title="시민팀 - 추가">
        <Role name="군인" color="var(--green)">
          마피아의 첫 공격을 게임당 1회 자동 방어. 자경단/투표/트릭 방어 불가. 발동 후 일반 시민과 동일.
        </Role>
        <Role name="정치인" color="var(--green)">
          모든 투표 2표. 투표 처형 면역(횟수 무제한). 마피아/자경단/트릭은 방어 불가.
        </Role>
        <Role name="자경단" color="var(--green)">
          게임당 1회, 낮 토론 또는 밤에 즉시 1명 살해. 투표 중 사용 불가. 의사/군인/정치인도 방어 불가. 취소 불가.
        </Role>
        <Role name="기자" color="var(--green)">
          밤에 1명의 실제 직업 취재(첫날 밤 불가). 다음 날 전체 공개. 사망해도 기사 발행.
        </Role>
        <Role name="마술사" color="var(--green)">
          밤에 1명에게 트릭 설정(최대 3회, 안 쓸 수도 있음). 밤에 마피아에게 공격당하면 트릭 대상이 대신 사망. 낮 투표/자경단에는 트릭 발동 안 됨.
        </Role>
        <Role name="일반시민" color="var(--green)">
          특별한 능력 없음. 토론과 투표로 마피아를 찾으세요.
        </Role>
        <Role name="정신병자" color="var(--orange)">
          본인은 모릅니다. 위장 직업이 표시되지만 능력이 실제로 작동하지 않습니다. 경찰: 무작위 결과 / 의사: 치료 무효 / 군인: 방어 불가 / 정치인: 1표, 처형 면역 없음 / 자경단: 살해 무효 / 기자: 무작위 직업 보도 / 마술사: 트릭 무효.
        </Role>
      </Section>

      <Section title="사망 처리 우선순위">
        <p>마피아 공격: 의사 치료 확인 → 군인 방어 확인 → 마술사 트릭 확인 → 사망</p>
        <p>투표 처형: 정치인 면역 확인 → 사망 (마술사 트릭 발동 안 됨)</p>
        <p>자경단: 즉시 사망 (의사/군인/정치인/마술사 트릭 방어 불가)</p>
      </Section>
    </div>
  );
}

function AvalonRules() {
  return (
    <div className="stack stack-16">
      <Section title="게임 흐름">
        <p>천사 진영 vs 악마 진영. 5~10명.</p>
        <p>원정대장이 원정대 구성 → 전원 찬반 투표 → 통과 시 원정 수행</p>
        <p>총 5개 원정 중 3개를 먼저 달성한 진영이 유리.</p>
        <p>천사가 3개 성공해도, 대악마가 대천사를 맞히면 악마 승리!</p>
        <p>연속 5번 부결 시 악마 즉시 승리.</p>
      </Section>

      <Section title="천사 진영">
        <Role name="천사" color="var(--blue)">
          정체를 알 수 없음. 원정에서 반드시 성공 선택. 토론과 투표 기록으로 악마를 찾아야 합니다.
        </Role>
        <Role name="대천사" color="var(--blue)">
          모든 악마 진영을 확인. 원정에서 반드시 성공. 정체가 들키면 대악마에게 지목당할 수 있으니 주의.
        </Role>
      </Section>

      <Section title="악마 진영">
        <Role name="악마" color="var(--red)">
          다른 악마 진영 확인. 원정에서 성공/실패 자유 선택. 정체를 숨기기 위해 성공할 수도 있음.
        </Role>
        <Role name="대악마" color="var(--red)">
          다른 악마 진영 확인. 성공/실패 자유 선택. 천사 3승 시 대천사를 지목 — 맞히면 악마 승리.
        </Role>
      </Section>

      <Section title="원정 규칙">
        <p>원정대원 중 실패가 1개라도 있으면 원정 실패.</p>
        <p>7명 이상일 때 4차 원정만 실패 2개 이상이어야 실패.</p>
        <p>천사/대천사는 반드시 성공만 선택 가능.</p>
        <p>악마/대악마는 성공 또는 실패 자유 선택.</p>
      </Section>

      <Section title="시작 정보">
        <p>천사: 자신의 역할만 확인</p>
        <p>대천사: 모든 악마와 대악마 확인</p>
        <p>악마: 모든 악마와 대악마 확인</p>
        <p>대악마: 모든 악마 확인</p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>{title}</h3>
      <div className="stack stack-4" style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-dim)' }}>
        {children}
      </div>
    </div>
  );
}

function Role({ name, color, children }: { name: string; color: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontWeight: 700, color, fontSize: 13 }}>{name}</span>
      <p style={{ marginTop: 2, fontSize: 12, lineHeight: 1.5, color: 'var(--text-dim)' }}>{children}</p>
    </div>
  );
}
