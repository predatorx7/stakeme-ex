import type { MockBank } from '../../types/index.ts'
import { escapeText } from '../../utils/escape.ts'
import { formatUsdc } from '../../utils/money.ts'
import { PageHeader } from '../PageHeader.tsx'
import { SectionCard } from '../SectionCard.tsx'

/** Fake bank statement the Reclaim provider reads. Props: `MockBank`. */
export function MockBankPage({ bank }: { bank: MockBank }) {
	return (
		<>
			<PageHeader
				eyebrow='Mock bank'
				title={bank.account}
				lede={`Balance ${formatUsdc(bank.balance)}`} />
			<SectionCard title='Transactions'>
				<ul id='transactions'>
					{
						bank.transactions.map((t) => (
							<li data-type={t.type}>
								{
									escapeText(
										`${t.date} ${t.description} ${formatUsdc(t.amount)}`,
									)
								}
							</li>
						))
					}
				</ul>
			</SectionCard>
		</>
	)
}
