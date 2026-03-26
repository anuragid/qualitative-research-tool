import { useState } from 'react';
import { useForm } from 'react-hook-form';

interface ContactFormData {
  name: string;
  email: string;
  role: string;
  message: string;
}

type FormStatus = 'idle' | 'submitting' | 'success' | 'error';

const FORMSPREE_URL =
  import.meta.env.VITE_FORMSPREE_ENDPOINT || 'https://formspree.io/f/placeholder';

export function ContactForm() {
  const [status, setStatus] = useState<FormStatus>('idle');
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<ContactFormData>();

  const onSubmit = async (data: ContactFormData) => {
    setStatus('submitting');
    try {
      const response = await fetch(FORMSPREE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(data),
      });
      if (response.ok) {
        setStatus('success');
        reset();
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  };

  return (
    <section className="contact-section" id="contact">
      <div className="contact-inner">
        <p className="section-label reveal">Get in Touch</p>
        <h2 className="contact-heading reveal">
          <em>Say</em> hello
        </h2>

        <form className="contact-form reveal" onSubmit={handleSubmit(onSubmit)}>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="contact-name" className="form-label">
                Name
              </label>
              <input
                type="text"
                id="contact-name"
                className="form-input"
                placeholder="Your name"
                {...register('name', { required: true })}
              />
              {errors.name && (
                <span style={{ color: 'var(--color-gold)', fontSize: 12 }}>Name is required</span>
              )}
            </div>
            <div className="form-group">
              <label htmlFor="contact-email" className="form-label">
                Email
              </label>
              <input
                type="email"
                id="contact-email"
                className="form-input"
                placeholder="you@university.edu"
                {...register('email', { required: true })}
              />
              {errors.email && (
                <span style={{ color: 'var(--color-gold)', fontSize: 12 }}>Email is required</span>
              )}
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="contact-role" className="form-label">
              Role
            </label>
            <select
              id="contact-role"
              className="form-select"
              defaultValue=""
              {...register('role')}
            >
              <option value="" disabled>
                Select your role
              </option>
              <option value="Student">Student</option>
              <option value="Faculty">Faculty</option>
              <option value="Researcher">Researcher</option>
              <option value="Industry Professional">Industry Professional</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="contact-message" className="form-label">
              Message
            </label>
            <textarea
              id="contact-message"
              className="form-textarea"
              placeholder="What are you working on?"
              rows={4}
              {...register('message')}
            />
          </div>

          {status === 'success' ? (
            <p
              style={{
                color: 'var(--color-teal)',
                fontWeight: 500,
                textAlign: 'center',
                fontSize: 'var(--fs-body)',
              }}
            >
              Message sent!
            </p>
          ) : (
            <button
              type="submit"
              className="form-submit"
              disabled={status === 'submitting'}
            >
              {status === 'submitting' ? 'Sending...' : 'Send Message'}
            </button>
          )}

          {status === 'error' && (
            <p
              style={{
                color: 'var(--color-gold)',
                fontSize: 'var(--fs-small)',
                textAlign: 'center',
              }}
            >
              Something went wrong. Please try again.
            </p>
          )}
        </form>
      </div>
    </section>
  );
}
