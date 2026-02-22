export default function AuthGate({ status, deniedEmail, authError, onSignIn, onSignOut, busy }) {
  if (status === 'checking') {
    return (
      <div style={containerStyle} dir="rtl">
        בודק הרשאות...
      </div>
    );
  }

  if (status === 'authorized') {
    return null;
  }

  const deniedMessage = status === 'denied' ? 'אין הרשאה. פנה למנהל להוספת אימייל במערכת.' : null;

  return (
    <div style={containerStyle} dir="rtl">
      <div style={cardStyle}>
        <h2 style={{ marginTop: 0, marginBottom: '0.5rem' }}>כניסה למערכת</h2>
        <p style={{ marginTop: 0, marginBottom: '1rem' }}>
          הגישה מותרת רק למיילים מורשים.
        </p>
        {deniedMessage ? <p style={errorStyle}>{deniedMessage}</p> : null}
        {status === 'denied' && deniedEmail ? <p style={mutedStyle}>{deniedEmail}</p> : null}
        {authError && status !== 'denied' ? <p style={errorStyle}>התחברות נכשלה. נסה שוב.</p> : null}
        {status === 'denied' ? (
          <button type="button" onClick={onSignOut} disabled={busy} style={buttonStyle}>
            התנתק
          </button>
        ) : (
          <button type="button" onClick={onSignIn} disabled={busy} style={buttonStyle}>
            התחבר עם Google
          </button>
        )}
      </div>
    </div>
  );
}

const containerStyle = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '2rem',
  textAlign: 'right',
  background: 'var(--bg)',
  color: 'var(--text)'
};

const cardStyle = {
  width: '100%',
  maxWidth: '420px',
  background: 'var(--panel-bg)',
  border: 'var(--grid-border-width) solid var(--grid-border-color)',
  borderRadius: 'var(--radius)',
  boxShadow: 'var(--shadow)',
  padding: '1.25rem'
};

const buttonStyle = {
  width: '100%',
  border: 'var(--grid-border-width) solid var(--grid-border-color)',
  background: '#ffffff',
  borderRadius: 'var(--radius)',
  padding: '0.6rem 0.75rem',
  cursor: 'pointer'
};

const errorStyle = {
  marginTop: 0,
  marginBottom: '0.75rem',
  color: '#ac2542',
  fontWeight: 700
};

const mutedStyle = {
  marginTop: 0,
  marginBottom: '0.75rem',
  color: 'var(--muted-text)'
};
