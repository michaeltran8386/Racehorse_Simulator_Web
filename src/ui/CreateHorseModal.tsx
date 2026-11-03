import { useEffect, useState, type FormEvent } from 'react';
import { Popup } from './Popup.tsx';
import { createHorse, loadCatalogs } from '../api/horsesApi.ts';
import { toHorseProfile } from '../api/horseMapper.ts';
import type { HorseProfile } from '../sim/engine.ts';
import c from './CreateHorseModal.module.css';

interface Props {
  onClose: () => void;
  onCreated: (horse: HorseProfile) => void;
  totalHorsesCount: number;
}

export function CreateHorseModal({ onClose, onCreated, totalHorsesCount }: Props) {
  const [name, setName] = useState('');
  const [breed, setBreed] = useState('Thoroughbred');
  const [dob, setDob] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 3);
    return d.toISOString().slice(0, 10);
  });
  const [gender, setGender] = useState('STALLION');
  const [color, setColor] = useState('Bay');
  const [weightKg, setWeightKg] = useState('');
  const [microchip, setMicrochip] = useState('');

  const [breeds, setBreeds] = useState<string[]>(['Thoroughbred', 'Arabian', 'Quarter Horse']);
  const [colors, setColors] = useState<string[]>(['Bay', 'Chestnut', 'Black', 'Gray', 'Roan']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCatalogs().then((cats) => {
      if (cats.breeds.length > 0) {
        setBreeds(cats.breeds);
        setBreed(cats.breeds[0]);
      }
      if (cats.colors.length > 0) {
        setColors(cats.colors);
        setColor(cats.colors[0]);
      }
    });
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Vui lòng nhập tên ngựa.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload: any = {
        name: name.trim(),
        breed,
        dob: new Date(dob).toISOString(),
        gender,
        color,
        weightKg: Number(weightKg),
      };
      if (microchip.trim()) payload.microchip = microchip.trim();

      const created = await createHorse(payload);
      const mapped = toHorseProfile(created, totalHorsesCount);
      onCreated(mapped);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Không thể tạo hồ sơ ngựa.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Popup title="Đăng ký ngựa mới (Hệ thống thật)" onClose={onClose}>
      {error && <div className={c.errorBanner}>{error}</div>}

      <form className={c.form} onSubmit={handleSubmit}>
        <div className={c.field}>
          <label className={c.label} htmlFor="ch-weight">Cân nặng (kg) *</label>
          <input id="ch-weight" className={c.input} type="number" min="0.01" step="any" required value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />
        </div>
        <div className={c.field}>
          <label className={c.label} htmlFor="ch-name">
            Tên ngựa *
          </label>
          <input
            id="ch-name"
            type="text"
            className={c.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ví dụ: Tia Chớp Xanh"
            required
            disabled={loading}
          />
        </div>

        <div className={c.row}>
          <div className={c.field}>
            <label className={c.label} htmlFor="ch-breed">
              Giống ngựa
            </label>
            <select
              id="ch-breed"
              className={c.select}
              value={breed}
              onChange={(e) => setBreed(e.target.value)}
              disabled={loading}
            >
              {breeds.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          <div className={c.field}>
            <label className={c.label} htmlFor="ch-gender">
              Giới tính
            </label>
            <select
              id="ch-gender"
              className={c.select}
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              disabled={loading}
            >
              <option value="STALLION">Ngựa đực (Stallion)</option>
              <option value="MARE">Ngựa cái (Mare)</option>
              <option value="GELDING">Ngựa thiến (Gelding)</option>
            </select>
          </div>
        </div>

        <div className={c.row}>
          <div className={c.field}>
            <label className={c.label} htmlFor="ch-color">
              Màu lông
            </label>
            <select
              id="ch-color"
              className={c.select}
              value={color}
              onChange={(e) => setColor(e.target.value)}
              disabled={loading}
            >
              {colors.map((cl) => (
                <option key={cl} value={cl}>
                  {cl}
                </option>
              ))}
            </select>
          </div>

          <div className={c.field}>
            <label className={c.label} htmlFor="ch-dob">
              Ngày sinh
            </label>
            <input
              id="ch-dob"
              type="date"
              className={c.input}
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              required
              disabled={loading}
            />
          </div>
        </div>

        <div className={c.field}>
          <label className={c.label} htmlFor="ch-chip">
            Mã chip vi mạch (15 số ISO, tùy chọn)
          </label>
          <input
            id="ch-chip"
            type="text"
            className={c.input}
            value={microchip}
            onChange={(e) => setMicrochip(e.target.value)}
            placeholder="Để trống để BE tự sinh 985..."
            disabled={loading}
          />
        </div>

        <div className={c.actions}>
          <button type="button" className={c.cancelBtn} onClick={onClose} disabled={loading}>
            Hủy
          </button>
          <button type="submit" className={c.saveBtn} disabled={loading}>
            {loading ? 'Đang tạo...' : 'Tạo hồ sơ vào Database'}
          </button>
        </div>
      </form>
    </Popup>
  );
}
