import type { PropsWithChildren } from '@kitajs/html'
import type { MockBank } from '../../types/index.ts'
import { escapeText, trustedHtml } from '../../utils/escape.ts'

/* eslint-disable @stylistic/max-len */
const STYLE = `
*{box-sizing:border-box}
body{margin:0;font:14px/1.5 Arial,Helvetica,sans-serif;background:#f2f4f7;color:#222}
header{background:#00376b;color:#fff;padding:14px 24px;display:flex;justify-content:space-between;align-items:center}
header strong{font-size:20px;letter-spacing:.5px}
header a{color:#fff;font-size:13px}
main{max-width:760px;margin:24px auto;padding:0 16px}
.card{background:#fff;border:1px solid #d5dae1;border-radius:4px;padding:20px;margin-bottom:16px}
h1{font-size:18px;margin:0 0 4px}
.muted{color:#667}
.bal{font-size:26px;font-weight:bold;margin-top:8px}
table{width:100%;border-collapse:collapse}
th,td{text-align:left;padding:8px 6px;border-bottom:1px solid #e5e8ec}
td.amt,th.amt{text-align:right}
.DEPOSIT{color:#0a7a2f}.WITHDRAWAL{color:#b3261e}
label{display:block;margin:12px 0 4px;font-weight:bold}
input{width:100%;padding:8px;border:1px solid #b8c0cc;border-radius:3px;font-size:14px}
button{margin-top:16px;padding:9px 20px;background:#e5252a;color:#fff;border:0;border-radius:3px;font-size:14px;cursor:pointer}
.hint{margin-top:16px;padding:10px;background:#fff8e1;border:1px solid #f0d98c;font-size:12px}
`

function BankShell(
	{ title, children, signOut }:
	PropsWithChildren<{ title: string, signOut?: boolean }>,
) {
	return (
		<html lang='en'>
			<head>
				<meta charset='UTF-8' />
				<meta
					name='viewport'
					content='width=device-width, initial-scale=1.0' />
				<meta
					name='robots'
					content='noindex, nofollow' />
				<title>
					{escapeText(title)}
				</title>
				<style>
					{trustedHtml(STYLE)}
				</style>
			</head>
			<body>
				<header>
					<strong>
						HDFC Bank NetBanking
					</strong>
					{
						signOut && (
							<a href='/mock-bank/login'>
								Switch user
							</a>
						)
					}
				</header>
				<main>
					{children}
				</main>
			</body>
		</html>
	)
}

/** Fake bank sign-in. No SMX branding: it simulates a real bank. */
export function MockBankLoginPage() {
	return (
		<BankShell title='NetBanking Login'>
			<section class='card'>
				<h1>
					Customer login
				</h1>
				<form
					method='post'
					action='/mock-bank/login'>
					<label for='username'>
						Customer ID
					</label>
					<input
						id='username'
						name='username'
						required
						maxlength='60'
						autocomplete='username' />
					<label for='password'>
						Password
					</label>
					<input
						id='password'
						name='password'
						type='password'
						required
						maxlength='100'
						autocomplete='current-password' />
					<button type='submit'>
						Login
					</button>
				</form>
				<p class='hint'>
					Demo bank: any non-empty customer ID and password works.
				</p>
			</section>
		</BankShell>
	)
}

// `no-referrer`: the Referer header repeats the API URL, which the Reclaim
// attestor can't redact within its budget, so the provider can't hide it.
const FETCH_SCRIPT = `
fetch('/mock-bank/api/transactions',{credentials:'same-origin',referrerPolicy:'no-referrer',headers:{accept:'application/json'}})
.then(function(r){if(r.status===401){location.href='/mock-bank/login';return null}return r.json()})
.then(function(b){
if(!b)return
document.getElementById('holder').textContent=b.holderName
document.getElementById('account').textContent=b.account
document.getElementById('balance').textContent='$'+b.balance
var tb=document.getElementById('txns');tb.textContent=''
b.transactions.forEach(function(t){
var tr=document.createElement('tr')
;[t.date,t.description,t.type].forEach(function(v,i){var td=document.createElement('td');td.textContent=v;if(i===2)td.className=t.type;tr.appendChild(td)})
var a=document.createElement('td');a.className='amt '+t.type;a.textContent=(t.type==='DEPOSIT'?'+':'-')+'$'+t.amount;tr.appendChild(a)
tb.appendChild(tr)})
})
`

/* eslint-enable @stylistic/max-len */

/** Fake bank statement the Reclaim provider reads. Props: `MockBank`. */
export function MockBankPage({ bank }: { bank: MockBank }) {
	return (
		<BankShell
			title='Account statement'
			signOut>
			<section class='card'>
				<h1>
					Welcome,
					{' '}
					<span id='holder'>
						{escapeText(bank.holderName)}
					</span>
				</h1>
				<div class='muted'>
					<span id='account'>
						{escapeText(bank.account)}
					</span>
				</div>
				<div
					id='balance'
					class='bal'>
					{escapeText(`$${bank.balance}`)}
				</div>
			</section>
			<section class='card'>
				<h1>
					Recent transactions
				</h1>
				<table>
					<thead>
						<tr>
							<th>
								Date
							</th>
							<th>
								Description
							</th>
							<th>
								Type
							</th>
							<th class='amt'>
								Amount
							</th>
						</tr>
					</thead>
					<tbody id='txns'>
						{
							bank.transactions.map((t) => (
								<tr>
									<td>
										{escapeText(t.date)}
									</td>
									<td>
										{escapeText(t.description)}
									</td>
									<td class={t.type}>
										{escapeText(t.type)}
									</td>
									<td class={`amt ${t.type}`}>
										{
											escapeText(
												`${t.type === 'DEPOSIT' ? '+' : '-'}$${t.amount}`,
											)
										}
									</td>
								</tr>
							))
						}
					</tbody>
				</table>
			</section>
			<script>
				{trustedHtml(FETCH_SCRIPT)}
			</script>
		</BankShell>
	)
}
