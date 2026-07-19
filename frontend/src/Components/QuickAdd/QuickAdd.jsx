import { useEffect, useState } from "react";
import './QuickAdd.css'

function QuickAdd(){
    const [orderNum, setOrderNum] = useState("");
    const [status, setStatus] = useState("");

    return(
        <form className="quickAddBox">
            <input value={orderNum} onChange={e=>setOrderNum(e.target.value)} placeholder="Add a Order #"/>
            <select
                value={status}
                onChange={e=>setStatus(e.target.value)}>
                <option value=""></option>
                <option value={"Order Received"}>Order Received</option>
                <option value={"Shipping"}>Shipping</option>
                <option value={"Shipped"}>Shipped</option>
                <option value={"Out for delivery"}>Out for delivery</option>
                <option value={"Delivered"}>Delivered</option>
            </select>
            <button type="Submit">Submit</button>
        </form>
    )
}

export default QuickAdd;